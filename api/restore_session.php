<?php
require __DIR__ . '/db.php';
$data   = json_decode(file_get_contents('php://input'), true);
$userId = (int)($data['user_id'] ?? 0);
if (!$userId) { http_response_code(400); echo json_encode(['ok' => false]); exit; }

$stmt = $conn->prepare("SELECT id, nome, email, tipo FROM users WHERE id = ? LIMIT 1");
$stmt->bind_param("i", $userId);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$user) { http_response_code(404); echo json_encode(['ok' => false]); exit; }

session_start();
$_SESSION['user_id']    = (int)$user['id'];
$_SESSION['user_nome']  = $user['nome'];
$_SESSION['user_email'] = $user['email'];
$_SESSION['user_tipo']  = strtoupper($user['tipo']);

// Resolve permissões: perfil padrão ou customizado
$tipo        = strtoupper($user['tipo']);
$permissions = null;

if ($tipo !== 'ADMIN') {
    $pStmt = $conn->prepare("SELECT permissions FROM profiles WHERE nome = ? LIMIT 1");
    if ($pStmt) {
        $pStmt->bind_param('s', $user['tipo']);
        $pStmt->execute();
        $pRow = $pStmt->get_result()->fetch_assoc();
        if ($pRow) {
            $permissions = json_decode($pRow['permissions'], true);
            $_SESSION['user_permissions'] = $pRow['permissions'];
        } elseif (!in_array($tipo, ['ADMIN','SECRETARIA','FISIOTERAPEUTA','FUNCIONARIO'])) {
            $tipo = 'FUNCIONARIO';
            $_SESSION['user_tipo'] = 'FUNCIONARIO';
        }
    }
}

echo json_encode([
    'ok'          => true,
    'tipo'        => $tipo,
    'tipoOriginal'=> strtoupper($user['tipo']),
    'permissions' => $permissions
]);
