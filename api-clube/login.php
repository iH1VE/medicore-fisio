<?php
require __DIR__ . '/_common.php';

$data = club_json_input();

$email = trim($data['email'] ?? '');
$senha = (string)($data['senha'] ?? '');

if ($email === '' || $senha === '') {
    club_respond(["ok" => false, "error" => "E-mail e senha são obrigatórios"], 400);
}

$stmt = $conn->prepare("
    SELECT id, patient_id, nome, email, telefone, senha_hash, pontos, pontos_total, nivel, status
    FROM club_users
    WHERE email = ?
    LIMIT 1
");
$stmt->bind_param("s", $email);
$stmt->execute();
$res = $stmt->get_result();
$user = $res ? $res->fetch_assoc() : null;
$stmt->close();

if (!$user || !password_verify($senha, $user['senha_hash'])) {
    club_respond(["ok" => false, "error" => "Login inválido"], 401);
}

if (($user['status'] ?? '') !== 'ativo') {
    club_respond(["ok" => false, "error" => "Conta inativa"], 403);
}

$_SESSION['club_user'] = [
    "id" => (int)$user['id'],
    "patient_id" => $user['patient_id'],
    "nome" => $user['nome'],
    "email" => $user['email'],
    "telefone" => $user['telefone'],
    "pontos" => (int)$user['pontos'],
    "pontos_total" => (int)$user['pontos_total'],
    "nivel" => $user['nivel'],
    "status" => $user['status']
];

club_respond([
    "ok" => true,
    "user" => $_SESSION['club_user']
]);
