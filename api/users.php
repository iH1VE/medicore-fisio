<?php
session_start();
require __DIR__ . '/_common.php';

if (empty($_SESSION['user_id']) || strtoupper($_SESSION['user_tipo'] ?? '') !== 'ADMIN') {
    respond_json(['ok' => false, 'error' => 'Acesso negado'], 403);
}

$conn->query("ALTER TABLE users ADD COLUMN IF NOT EXISTS ativo TINYINT(1) NOT NULL DEFAULT 1");

// Verifica se o ID corresponde ao admin protegido
function is_protected($conn, $id) {
    $s = $conn->prepare("SELECT email FROM users WHERE id=? LIMIT 1");
    $s->bind_param('i', $id); $s->execute();
    $r = $s->get_result()->fetch_assoc(); $s->close();
    return $r && strtolower($r['email']) === 'admin@admin.com';
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $res = $conn->query("SELECT id, nome, email, tipo, ativo FROM users ORDER BY nome ASC");
    $users = [];
    while ($row = $res->fetch_assoc()) {
        $users[] = ['id'=>(int)$row['id'],'nome'=>$row['nome'],'email'=>$row['email'],'tipo'=>$row['tipo'],'ativo'=>(int)$row['ativo']];
    }
    respond_json(['ok' => true, 'users' => $users]);
}

if ($method === 'POST') {
    $data    = json_input();
    $id      = isset($data['id']) ? (int)$data['id'] : 0;
    $nome    = trim($data['nome']  ?? '');
    $email   = trim($data['email'] ?? '');
    $tipoRaw = trim($data['tipo']  ?? 'FUNCIONARIO');
    $ativo   = isset($data['ativo']) ? (int)(bool)$data['ativo'] : 1;
    $senha   = $data['senha'] ?? '';

    if (!$nome || !$email) respond_json(['ok' => false, 'error' => 'Nome e email obrigatórios'], 400);
    if ($id > 0 && is_protected($conn, $id)) {
        respond_json(['ok' => false, 'error' => 'O usuário administrador principal não pode ser editado'], 403);
    }

    // Valida tipo: built-in ou perfil customizado válido
    $builtins = ['ADMIN','SECRETARIA','FISIOTERAPEUTA','FUNCIONARIO'];
    $tipo = strtoupper($tipoRaw);
    if (!in_array($tipo, $builtins)) {
        $pc = $conn->prepare("SELECT nome FROM profiles WHERE nome = ? LIMIT 1");
        $pc->bind_param('s', $tipoRaw); $pc->execute();
        $pr = $pc->get_result()->fetch_assoc(); $pc->close();
        if (!$pr) respond_json(['ok' => false, 'error' => 'Perfil inválido'], 400);
        $tipo = $pr['nome'];
    }

    if ($id > 0) {
        if ($senha) {
            $hash = password_hash($senha, PASSWORD_DEFAULT);
            $stmt = $conn->prepare("UPDATE users SET nome=?, email=?, tipo=?, ativo=?, senha=? WHERE id=?");
            $stmt->bind_param('sssisi', $nome, $email, $tipo, $ativo, $hash, $id);
        } else {
            $stmt = $conn->prepare("UPDATE users SET nome=?, email=?, tipo=?, ativo=? WHERE id=?");
            $stmt->bind_param('sssii', $nome, $email, $tipo, $ativo, $id);
        }
        $stmt->execute();
        respond_json(['ok' => true, 'id' => $id]);
    } else {
        if (!$senha) respond_json(['ok' => false, 'error' => 'Senha obrigatória para novo usuário'], 400);
        $hash = password_hash($senha, PASSWORD_DEFAULT);
        $stmt = $conn->prepare("INSERT INTO users (nome, email, senha, tipo, ativo) VALUES (?, ?, ?, ?, ?)");
        $stmt->bind_param('ssssi', $nome, $email, $hash, $tipo, $ativo);
        if (!$stmt->execute()) respond_json(['ok' => false, 'error' => 'Email já cadastrado: ' . $stmt->error], 400);
        respond_json(['ok' => true, 'id' => $conn->insert_id]);
    }
}

if ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) respond_json(['ok' => false, 'error' => 'ID obrigatório'], 400);
    if ($id === (int)$_SESSION['user_id']) respond_json(['ok' => false, 'error' => 'Não é possível excluir sua própria conta'], 400);
    if (is_protected($conn, $id)) respond_json(['ok' => false, 'error' => 'O usuário administrador principal não pode ser excluído'], 403);
    $stmt = $conn->prepare("DELETE FROM users WHERE id=?");
    $stmt->bind_param('i', $id); $stmt->execute();
    respond_json(['ok' => true]);
}

respond_json(['ok' => false, 'error' => 'Método não permitido'], 405);
