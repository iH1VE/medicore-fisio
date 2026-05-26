<?php
session_start();
header("Content-Type: application/json; charset=utf-8");
require_once __DIR__ . "/db.php";

$data = json_decode(file_get_contents("php://input"), true);

$email = trim($data["email"] ?? "");
$senha = $data["senha"] ?? "";

if (!$email || !$senha) {
    http_response_code(400);
    echo json_encode(["ok" => false, "error" => "Email e senha são obrigatórios"]);
    exit;
}

// ── Rate limiting: máx 10 tentativas por IP a cada 10 minutos ──────────────
$_ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$conn->query("CREATE TABLE IF NOT EXISTS login_attempts (
    ip VARCHAR(45) NOT NULL,
    attempts INT NOT NULL DEFAULT 1,
    window_start DATETIME NOT NULL,
    PRIMARY KEY (ip)
) CHARACTER SET utf8mb4");
$conn->query("DELETE FROM login_attempts WHERE window_start < DATE_SUB(NOW(), INTERVAL 10 MINUTE)");
$_stmtRl = $conn->prepare("SELECT attempts FROM login_attempts WHERE ip = ? LIMIT 1");
$_stmtRl->bind_param('s', $_ip);
$_stmtRl->execute();
$_rlRow = $_stmtRl->get_result()->fetch_assoc();
$_stmtRl->close();
if ($_rlRow && (int)$_rlRow['attempts'] >= 10) {
    http_response_code(429);
    echo json_encode(["ok" => false, "error" => "Muitas tentativas. Aguarde alguns minutos."]);
    exit;
}
// ─────────────────────────────────────────────────────────────────────────────

$stmt = $conn->prepare("SELECT id, nome, email, senha, tipo FROM users WHERE email = ? LIMIT 1");
$stmt->bind_param("s", $email);
$stmt->execute();
$res = $stmt->get_result();
$user = $res->fetch_assoc();

if (!$user || !password_verify($senha, $user["senha"])) {
    // Registra tentativa falha
    $_stmtFail = $conn->prepare("INSERT INTO login_attempts (ip, attempts, window_start) VALUES (?, 1, NOW()) ON DUPLICATE KEY UPDATE attempts = attempts + 1");
    $_stmtFail->bind_param('s', $_ip);
    $_stmtFail->execute();
    $_stmtFail->close();
    http_response_code(401);
    echo json_encode(["ok" => false, "error" => "Login inválido"]);
    exit;
}

$_SESSION["user_id"] = (int)$user["id"];
$_SESSION["user_nome"] = $user["nome"];
$_SESSION["user_email"] = $user["email"];
$_SESSION["user_tipo"] = strtoupper($user["tipo"]);

echo json_encode([
    "ok" => true,
    "user" => [
        "id" => (int)$user["id"],
        "nome" => $user["nome"],
        "email" => $user["email"],
        "tipo" => strtoupper($user["tipo"])
    ]
]);
