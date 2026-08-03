// FR-01 / FR-07 認証（Google Identity Services、ブラウザ内で完結・中継サーバーなし）

import { SCOPE, getClientId } from "./config.js";
import { saveToken, loadToken, clearToken } from "./store.js";

let tokenClient = null;

/** gsi/client の読み込み完了を待つ */
function waitForGis(timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    (function poll() {
      if (window.google?.accounts?.oauth2) return resolve(window.google.accounts.oauth2);
      if (Date.now() - started > timeoutMs) {
        return reject(new Error("Google のログイン用スクリプトを読み込めませんでした。通信環境を確認してください。"));
      }
      setTimeout(poll, 50);
    })();
  });
}

async function ensureTokenClient() {
  const clientId = getClientId();
  if (!clientId) throw new Error("クライアント ID が設定されていません。");
  if (tokenClient && tokenClient.__clientId === clientId) return tokenClient;

  const oauth2 = await waitForGis();
  tokenClient = oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPE, // 読み取り専用のみ（NFR-06）
    callback: () => {},
  });
  tokenClient.__clientId = clientId;
  return tokenClient;
}

/** 有効なアクセストークン。なければ null（FR-07 の判定に使う） */
export function getStoredToken() {
  return loadToken()?.accessToken ?? null;
}

/**
 * ログイン。ポップアップを開くため、必ずユーザー操作（クリック）から呼ぶこと。
 * @returns {Promise<string>} access token
 */
export async function signIn() {
  const client = await ensureTokenClient();
  return new Promise((resolve, reject) => {
    client.callback = (res) => {
      if (res.error) {
        reject(new Error(describeError(res.error)));
        return;
      }
      saveToken(res.access_token, res.expires_in);
      resolve(res.access_token);
    };
    client.error_callback = (err) => {
      reject(new Error(describeError(err?.type || err?.message || "unknown")));
    };
    client.requestAccessToken();
  });
}

export function signOut() {
  const token = getStoredToken();
  clearToken();
  if (token && window.google?.accounts?.oauth2) {
    try {
      window.google.accounts.oauth2.revoke(token, () => {});
    } catch {
      /* 失効済みなら無視 */
    }
  }
}

export function invalidateToken() {
  clearToken();
}

function describeError(code) {
  switch (code) {
    case "popup_closed":
    case "popup_closed_by_user":
      return "ログイン画面が閉じられました。";
    case "popup_failed_to_open":
      return "ログイン画面を開けませんでした。ポップアップの許可を確認してください。";
    case "access_denied":
      return "アクセスが許可されませんでした。";
    case "idpiframe_initialization_failed":
      return "Google の初期化に失敗しました。";
    default:
      return `ログインに失敗しました（${code}）。クライアント ID と承認済みの JavaScript 生成元を確認してください。`;
  }
}
