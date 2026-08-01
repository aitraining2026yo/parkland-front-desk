/**
 * 網站登入設定（只放密碼嘅 SHA-256 hash，唔放明文）
 *
 * 密碼明文唔放喺呢度（只放 hash）。
 * 改密碼步驟見：web/改密碼說明.txt
 *
 * 注意：前端簡單鎖，擋一般人亂入；唔係銀行級保安。
 */
window.PARKLAND_AUTH = {
  // sha256 of the current site password (see 改密碼說明.txt)
  SITE_PASSWORD_SHA256:
    "68462106945b92da98fe8c16bbbc6fa0a9b8aed117c919c16c00f9ea97d8f72c",
  // session 記住已登入（閂晒分頁後要再入）
  SESSION_KEY: "parkland-front-desk-auth-v1",
};
