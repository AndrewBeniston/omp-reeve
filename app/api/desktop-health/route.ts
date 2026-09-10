import { createHmac } from "node:crypto"

const CHALLENGE_HEADER = "X-OMP-Desktop-Challenge"
const PROOF_HEADER = "X-OMP-Desktop-Proof"
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const dynamic = "force-dynamic"

export function GET(request: Request): Response {
  const token = process.env.OMP_WEB_DESKTOP_TOKEN
  if (!token) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    })
  }

  const challenge = request.headers.get(CHALLENGE_HEADER)
  if (!challenge || !UUID_PATTERN.test(challenge)) {
    return new Response(null, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    })
  }

  const proof = createHmac("sha256", token).update(challenge).digest("hex")

  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      [PROOF_HEADER]: proof,
    },
  })
}
