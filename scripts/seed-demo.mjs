#!/usr/bin/env node
/**
 * Seeds a demo account with a dozen posts whose captions describe their photos, so Explore
 * has something to search. Photos are Unsplash images served by Lorem Picsum.
 *
 *   node scripts/seed-demo.mjs [--base http://localhost/api]
 *
 * Signs in as novak_demo / DemoPassw0rd (creates it if needed). Safe to re-run: it skips
 * captions the account has already posted.
 */
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
);
const BASE = args.base ?? "http://localhost/api";
const USER = { username: "novak_demo", email: "novak_demo@example.com", password: "DemoPassw0rd", name: "Novak Demo" };

const POSTS = [
  [1025, "Wrapped my pug in a blanket for our forest walk, he still looks unimpressed", ["pug"]],
  [237, "Our new black lab puppy, already sitting on command", ["puppy"]],
  [431, "Latte art and a quiet table before work", []],
  [1060, "Pour-over station at our favourite cafe, the kettle goes all morning", []],
  [1015, "Looking down at a deep blue fjord from the cliff edge", ["norway"]],
  [1039, "Waterfall pouring into a mossy green valley after the rain", []],
  [1011, "Paddling a canoe across a still mountain lake at sunrise", []],
  [1074, "Face to face with a lioness at the wildlife reserve", []],
  [1084, "Walruses napping on the beach, zero interest in us", []],
  [1069, "Orange jellyfish drifting through the blue at the aquarium", []],
  [1080, "A whole crate of strawberries from the farmers market", []],
  [292, "Red onions, peppercorns and fresh herbs, prepping dinner", ["cooking"]],
];

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  let auth = await call("POST", "/auth/login", { body: { emailOrUsername: USER.username, password: USER.password } });
  if (auth.status === 401) auth = await call("POST", "/auth/register", { body: USER });
  if (!auth.body?.success) throw new Error(`Could not sign in as ${USER.username}: ${JSON.stringify(auth.body?.error)}`);
  const token = auth.body.data.accessToken;

  const existing = await call("GET", `/users/${USER.username}/posts?limit=50`, { token });
  const posted = new Set((existing.body?.data ?? []).map((p) => p.caption));

  let created = 0;
  // Oldest first, so the feed shows them in list order
  for (const [id, caption, tags] of [...POSTS].reverse()) {
    if (posted.has(caption)) continue;
    const res = await call("POST", "/posts", {
      token,
      body: { caption, tags, mediaUrl: `https://picsum.photos/id/${id}/1080/1080` },
    });
    if (res.status !== 201) throw new Error(`Post failed (${res.status}): ${JSON.stringify(res.body?.error)}`);
    created++;
  }
  console.log(`Created ${created} posts (${POSTS.length - created} already existed) as ${USER.username}.`);
  console.log("They become searchable once analysis finishes (a few seconds). Try Explore: 'ocean animals' or 'morning coffee'.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
