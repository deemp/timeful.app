import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { expect, type APIRequestContext } from "@playwright/test"

const execFileAsync = promisify(execFile)
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url))
const otpCode = "123456"

// Seeds a retained legacy user document and a valid OTP through the isolated
// mongo-test container so sign-in resolves the same PostgreSQL account contract
// the app uses. The database name matches .env.test's MONGODB_DATABASE.
export async function seedOtpAccount(email: string): Promise<void> {
  await execFileAsync(
    "docker",
    [
      "compose",
      "--env-file",
      ".env.test",
      "-f",
      "compose.yaml",
      "-f",
      "compose.test.yaml",
      "exec",
      "-T",
      "mongo-test",
      "mongosh",
      "--quiet",
      "mongodb://localhost:27017/timeful-test",
      "--eval",
      `db.users.deleteMany({email:${JSON.stringify(email)}}); db.users.insertOne({email:${JSON.stringify(email)},firstName:"E2E",lastName:"Deletion",calendarAccounts:{}}); db.otpCodes.updateOne({email:${JSON.stringify(email)}},{$set:{code:"${otpCode}",expiresAt:new Date(Date.now()+600000),attempts:0}},{upsert:true});`,
    ],
    { cwd: repositoryRoot },
  )
}

// Verifies the seeded OTP and returns the account _id, which is the PostgreSQL
// external user identifier surfaced by MergeAccountProfile.
export async function verifySignIn(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const response = await request.post("/api/auth/otp/verify", {
    data: { email, code: otpCode, timezoneOffset: 0 },
  })
  expect(response.status()).toBe(200)
  const profile = (await response.json()) as { _id: string }
  return profile._id
}

export function newDeletableEmail(label: string): string {
  return `delete-${label}-${randomUUID()}@example.invalid`
}

export async function signInNewAccount(
  request: APIRequestContext,
  label: string,
): Promise<{ email: string; userId: string }> {
  const email = newDeletableEmail(label)
  await seedOtpAccount(email)
  return { email, userId: await verifySignIn(request, email) }
}
