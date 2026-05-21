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

$stmt = $conn->prepare("SELECT id, nome, email, senha, tipo FROM users WHERE email = ? LIMIT 1");
$stmt->bind_param("s", $email);
$stmt->execute();
$res = $stmt->get_result();
$user = $res->fetch_assoc();

if (!$user || !password_verify($senha, $user["senha"])) {
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
