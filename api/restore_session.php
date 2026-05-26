<?php
require __DIR__ . '/db.php';

// Apenas valida sessão PHP existente.
// NÃO aceita user_id externo — impede escalada de privilégio.
if (!empty($_SESSION['user_id'])) {
    echo json_encode([
        'ok'    => true,
        'id'    => $_SESSION['user_id'],
        'nome'  => $_SESSION['user_nome'],
        'email' => $_SESSION['user_email'],
        'tipo'  => $_SESSION['user_tipo'],
    ], JSON_UNESCAPED_UNICODE);
} else {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Sessão expirada. Faça login novamente.']);
}
