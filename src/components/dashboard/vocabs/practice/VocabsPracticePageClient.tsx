"use client";

import { useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchVocabPracticePerformance, fetchVocabulary } from "@/lib/redux";
import { selectIsAuthenticated } from "@/lib/redux/selectors";
import VocabsPracticePage_Main from "./practice";

function Spinner() {
  return (
    <svg
      className="size-8 animate-spin text-primary"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/**
 * Client wrapper for the vocab practice page.
 *
 * For authenticated users: fetches vocabulary and practice performance on
 * mount, shows a spinner until both arrive, then renders the practice page.
 * Once the initial fetch is done we never go back to the spinner — background
 * saves that touch the same Redux slice should not remount this tree.
 *
 * For unauthenticated users: renders immediately (localStorage is used by the
 * hooks directly, no async fetch needed).
 */
export default function VocabsPracticePageClient() {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  // Local state: tracks whether the initial data fetch for this session is done.
  // Using local state (not Redux loading flags) means background PUT saves
  // to the same slice don't flip this back to false and remount the practice tree.
  const [dataReady, setDataReady] = useState(!isAuthenticated);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setDataReady(true);
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    // Fetch both in parallel, mark ready once both settle (fulfilled or rejected)
    Promise.allSettled([
      dispatch(fetchVocabulary()),
      dispatch(fetchVocabPracticePerformance()),
    ]).then(() => {
      setDataReady(true);
    });
  }, [isAuthenticated, dispatch]);

  if (!dataReady) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[calc(100vh-12rem)] gap-4"
        role="status"
        aria-live="polite"
        aria-label="Loading vocabulary practice"
      >
        <Spinner />
        <p className="text-sm text-muted-foreground animate-pulse">
          Loading your practice data…
        </p>
      </div>
    );
  }

  return <VocabsPracticePage_Main />;
}
