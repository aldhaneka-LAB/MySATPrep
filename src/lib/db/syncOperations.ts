/**
 * Sync Database Operations
 *
 * Upserts for all user data categories. The client (syncLocalStorageData thunk)
 * performs the full merge of DB + localStorage data before sending the payload,
 * so each upsert here simply **replaces** the existing row with the pre-merged
 * values rather than doing a second server-side merge.
 *
 * Each category is written as a standalone statement via pool.query() — no
 * manual BEGIN/COMMIT.
 *
 * Why no transaction:
 *   The app uses a PgBouncer pooler (DATABASE_URL). PgBouncer in transaction
 *   mode multiplexes statements across backend connections, so a client-level
 *   BEGIN/COMMIT does not wrap the same backend connection. Calling BEGIN on
 *   the pooler silently succeeds but the subsequent statements land on
 *   different connections, meaning COMMIT never actually commits. The result
 *   is a "success" response with zero rows changed.
 *
 *   Each upsert here is already atomic at the statement level (ON CONFLICT DO
 *   UPDATE is a single atomic operation in Postgres), so per-statement
 *   auto-commit is correct and safe.
 */

import { directPool } from "@/lib/auth";
import type { MigrationSummary } from "@/lib/types/api";
import type { ValidatedMigrationPayload } from "@/lib/validation/migrationSchema";
import type { AnsweredQuestion, ClassStatistics } from "@/types/statistics";
import type { PracticeSession } from "@/types/session";
import type { QuestionDetail } from "@/lib/types/userData";
import type { PlainQuestionType } from "@/types/question";
import {
  stripAnsweredQuestionsDetailed,
  stripClassStatistics,
} from "@/lib/db/statsTransforms";
import { stripSessionForDb } from "@/lib/db/sessionTransforms";
import { slimPlainQuestion } from "@/lib/db/bookmarkTransforms";

// ─── Collection question_details strip helper ─────────────────────────────────
function stripQuestionDetail(detail: QuestionDetail): {
  questionId: string;
  externalId: string | null;
  ibn: string | null;
} {
  return {
    questionId: detail.questionId,
    externalId: detail.externalId ?? null,
    ibn: detail.ibn ?? null,
  };
}

// Alias for clarity inside this file
const db = directPool;

export async function syncUserData(
  userId: string,
  data: ValidatedMigrationPayload,
): Promise<MigrationSummary> {
  const summary: MigrationSummary = {
    profileMigrated: false,
    statisticsMigrated: false,
    sessionsMigrated: 0,
    bookmarksMigrated: 0,
    collectionsMigrated: 0,
    vocabularyMigrated: false,
    preferencesMigrated: false,
    notesMigrated: false,
    answerHistoryMigrated: false,
    practicePerformanceMigrated: false,
  };

  // ── Profile ────────────────────────────────────────────────────────────────
  if (data.profile) {
    await db.query(
      `INSERT INTO user_profiles
         (user_id, total_xp, level, questions_answered, correct_answers,
          incorrect_answers, last_activity, xp_history)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET
         total_xp           = EXCLUDED.total_xp,
         level              = EXCLUDED.level,
         questions_answered  = EXCLUDED.questions_answered,
         correct_answers    = EXCLUDED.correct_answers,
         incorrect_answers  = EXCLUDED.incorrect_answers,
         last_activity      = EXCLUDED.last_activity,
         xp_history         = EXCLUDED.xp_history,
         updated_at         = CURRENT_TIMESTAMP`,
      [
        userId,
        data.profile.totalXP ?? 0,
        data.profile.level ?? 0,
        data.profile.questionsAnswered ?? 0,
        data.profile.correctAnswers ?? 0,
        data.profile.incorrectAnswers ?? 0,
        data.profile.lastActivity ?? null,
        JSON.stringify(data.profile.xpHistory ?? []),
      ],
    );
    summary.profileMigrated = true;
  }

  // ── Statistics ─────────────────────────────────────────────────────────────
  if (data.statistics && Object.keys(data.statistics).length > 0) {
    for (const [assessment, stats] of Object.entries(data.statistics)) {
      if (!stats) continue;

      // Strip plainQuestion and promote primary_class_cd / skill_cd before
      // writing.
      const strippedDetailed = stripAnsweredQuestionsDetailed(
        (stats.answeredQuestionsDetailed ?? []) as AnsweredQuestion[],
      );
      const strippedStatistics = stripClassStatistics(
        (stats.statistics ?? {}) as ClassStatistics,
      );

      await db.query(
        `INSERT INTO practice_statistics
           (user_id, assessment, answered_questions, answered_questions_detailed, statistics)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb)
         ON CONFLICT (user_id, assessment) DO UPDATE SET
           answered_questions          = EXCLUDED.answered_questions,
           answered_questions_detailed = EXCLUDED.answered_questions_detailed,
           statistics                  = EXCLUDED.statistics,
           updated_at                  = CURRENT_TIMESTAMP`,
        [
          userId,
          assessment,
          JSON.stringify(stats.answeredQuestions ?? []),
          JSON.stringify(strippedDetailed),
          JSON.stringify(strippedStatistics),
        ],
      );
    }
    summary.statisticsMigrated = true;
  }

  // ── Sessions ───────────────────────────────────────────────────────────────
  if (data.sessions && data.sessions.length > 0) {
    for (const session of data.sessions) {
      // Strip plainQuestion from answeredQuestionDetails and remove
      // questionCorrectChoices / correctAnswers / accuracyPercentage.
      const stripped = stripSessionForDb(
        session as PracticeSession & {
          correctAnswers?: number;
          accuracyPercentage?: number;
        },
      );

      await db.query(
        `INSERT INTO practice_sessions
           (user_id, session_id, session_data, status)
         VALUES ($1, $2, $3::jsonb, $4)
         ON CONFLICT (user_id, session_id) DO UPDATE SET
           session_data = EXCLUDED.session_data,
           status       = EXCLUDED.status,
           updated_at   = CURRENT_TIMESTAMP`,
        [
          userId,
          session.sessionId,
          JSON.stringify(stripped),
          session.status ?? "not_started",
        ],
      );
      summary.sessionsMigrated++;
    }
  }

  // ── Bookmarks ──────────────────────────────────────────────────────────────
  if (data.bookmarks && data.bookmarks.length > 0) {
    for (const bookmark of data.bookmarks) {
      try {
        await db.query(
          `INSERT INTO saved_questions
             (user_id, assessment, question_id, external_id, ibn, plain_question)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)
           ON CONFLICT (user_id, question_id) DO UPDATE SET
             assessment     = EXCLUDED.assessment,
             external_id    = EXCLUDED.external_id,
             ibn            = EXCLUDED.ibn,
             plain_question = EXCLUDED.plain_question`,
          [
            userId,
            bookmark.assessment,
            bookmark.questionId,
            bookmark.externalId ?? null,
            bookmark.ibn ?? null,
            bookmark.plainQuestion
              ? JSON.stringify(
                  slimPlainQuestion(
                    bookmark.plainQuestion as PlainQuestionType,
                  ),
                )
              : null,
          ],
        );
        summary.bookmarksMigrated++;
      } catch (err) {
        console.error(
          `[sync] bookmark FAILED: ${bookmark.questionId}`,
          err instanceof Error ? err.message : err,
        );
        throw err;
      }
    }
  }

  // ── Collections ────────────────────────────────────────────────────────────
  if (data.collections && data.collections.length > 0) {
    for (const collection of data.collections) {
      try {
        await db.query(
          `INSERT INTO saved_collections
           (user_id, collection_id, name, description, question_ids, question_details, color)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
         ON CONFLICT (user_id, collection_id) DO UPDATE SET
           name             = EXCLUDED.name,
           description      = EXCLUDED.description,
           question_ids     = EXCLUDED.question_ids,
           question_details = EXCLUDED.question_details,
           color            = EXCLUDED.color,
           updated_at       = CURRENT_TIMESTAMP`,
          [
            userId,
            collection.collectionId,
            collection.name,
            collection.description ?? null,
            JSON.stringify(collection.questionIds ?? []),
            JSON.stringify(
              (collection.questionDetails ?? []).map(stripQuestionDetail),
            ),
            collection.color ?? null,
          ],
        );
        summary.collectionsMigrated++;
      } catch (err) {
        console.error(
          `[sync] collection FAILED: ${collection.collectionId}`,
          err instanceof Error ? err.message : err,
        );
        throw err;
      }
    }
  }

  // ── Vocabulary ─────────────────────────────────────────────────────────────
  if (data.vocabulary && Object.keys(data.vocabulary).length > 0) {
    await db.query(
      `INSERT INTO vocabulary_progress (user_id, progress_data)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET
         progress_data = EXCLUDED.progress_data,
         updated_at    = CURRENT_TIMESTAMP`,
      [userId, JSON.stringify(data.vocabulary)],
    );
    summary.vocabularyMigrated = true;
  }

  // ── Preferences ────────────────────────────────────────────────────────────
  if (data.preferences && Object.keys(data.preferences).length > 0) {
    await db.query(
      `INSERT INTO user_preferences (user_id, preferences_data)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET
         preferences_data = EXCLUDED.preferences_data,
         updated_at       = CURRENT_TIMESTAMP`,
      [userId, JSON.stringify(data.preferences)],
    );
    summary.preferencesMigrated = true;
  }

  // ── Question Notes ─────────────────────────────────────────────────────────
  if (data.questionNotes && Object.keys(data.questionNotes).length > 0) {
    await db.query(
      `INSERT INTO question_notes (user_id, notes_data)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET
         notes_data = EXCLUDED.notes_data,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, JSON.stringify(data.questionNotes)],
    );
    summary.notesMigrated = true;
  }

  // ── Answer History ─────────────────────────────────────────────────────────
  if (data.answerHistory && Object.keys(data.answerHistory).length > 0) {
    await db.query(
      `INSERT INTO answer_history (user_id, history_data)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET
         history_data = EXCLUDED.history_data,
         updated_at   = CURRENT_TIMESTAMP`,
      [userId, JSON.stringify(data.answerHistory)],
    );
    summary.answerHistoryMigrated = true;
  }

  // ── Vocab Practice Performance ─────────────────────────────────────────────
  if (data.practicePerformance) {
    await db.query(
      `INSERT INTO vocab_practice_performance (user_id, performance_data)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET
         performance_data = EXCLUDED.performance_data,
         updated_at       = CURRENT_TIMESTAMP`,
      [userId, JSON.stringify(data.practicePerformance)],
    );
    summary.practicePerformanceMigrated = true;
  }

  return summary;
}
