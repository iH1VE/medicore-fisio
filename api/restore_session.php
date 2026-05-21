<?php
session_start();
require __DIR__ . '/db.php';

$data   = json_decode(file_get_contents('php://input'), true);
$userId = (int)($data['user_id']       ?? 0);
$token  = (string)($data['session_token'] ?? '');

if (!$userId || $token === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Dados insuficientes']);
    exit;
}

$stmt = $conn->prepare("SELECT id, nome, email, tipo FROM users WHERE id = ? LIMIT 1");
$stmt->bind_param("i", $userId);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$user) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'Usuário não encontrado']);
    exit;
}

// Validar token HMAC — deve bater com o gerado no login
$secret   = defined('SECRET_KEY') ? SECRET_KEY : '';
$expected = hash_hmac('sha256', $user['id'] . ':' . $user['email'], $secret);

if (!hash_equals($expected, $token)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Token inválido']);
    exit;
}

$_SESSION['user_id']    = (int)$user['id'];
$_SESSION['user_nome']  = $user['nome'];
$_SESSION['user_email'] = $user['email'];
$_SESSION['user_tipo']  = strtoupper($user['tipo']);

echo json_encode(['ok' => true, 'tipo' => strtoupper($user['tipo'])]);
