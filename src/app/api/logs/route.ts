import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");

  if (authHeader?.startsWith("Basic ")) {
    const base64 = authHeader.slice("Basic ".length);
    const decoded = Buffer.from(base64, "base64").toString("utf-8");
    const password = decoded.split(":")[1]; // format is "username:password"
    // console.log("password", password);
    // console.log("decoded", decoded);

    if (password === process.env.LOGS_PASSWORD) {
      return NextResponse.json({
        databaseUrl: process.env.DATABASE_URL,
        POSTGRES_URL: process.env.POSTGRES_URL,
        POSTGRES_URL_NON_POOLING: process.env.POSTGRES_URL_NON_POOLING,
        DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      });
      // return new NextResponse("Invalid");
    }
  }

  // Prompt the browser to show a native credential dialog
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Logs"',
    },
  });
}
