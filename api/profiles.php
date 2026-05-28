<?php
session_start();
require __DIR__ . '/_common.php';

if (empty($_SESSION['user_id']) || strtoupper($_SESSION['user_tipo'] ?? '') !== 'ADMIN') {
    respond_json(['ok' => false, 'error' => 'Acesso negado'], 403);
}

ensure_table($conn, "CREATE TABLE IF NOT EXISTS profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL UNIQUE,
  permissions LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $res = $conn->query("SELECT id, nome, permissions FROM profiles ORDER BY nome ASC");
    $profiles = [];
    while ($row = $res->fetch_assoc()) {
        $profiles[] = [
            'id'          => (int)$row['id'],
            'nome'        => $row['nome'],
            'permissions' => json_decode($row['permissions'], true)
        ];
    }
    respond_json(['ok' => true, 'profiles' => $profiles]);
}

if ($method === 'POST') {
    $data        = json_input();
    $id          = isset($data['id']) ? (int)$data['id'] : 0;
    $nome        = trim($data['nome'] ?? '');
    $permissions = $data['permissions'] ?? ['sections' => [], 'edit' => [], 'delete' => []];

    if (!$nome) respond_json(['ok' => false, 'error' => 'Nome obrigatório'], 400);

    // Garante que edit/delete são subconjuntos de sections
    $sections = $permissions['sections'] ?? [];
    $edit     = array_values(array_intersect($permissions['edit']   ?? [], $sections));
    $delete   = array_values(array_intersect($permissions['delete'] ?? [], $edit));
    $permissions = ['sections' => $sections, 'edit' => $edit, 'delete' => $delete];
    $permJson = json_encode($permissions, JSON_UNESCAPED_UNICODE);

    if ($id > 0) {
        $stmt = $conn->prepare("UPDATE profiles SET nome=?, permissions=? WHERE id=?");
        $stmt->bind_param('ssi', $nome, $permJson, $id);
    } else {
        $stmt = $conn->prepare("INSERT INTO profiles (nome, permissions) VALUES (?, ?) ON DUPLICATE KEY UPDATE permissions=VALUES(permissions)");
        $stmt->bind_param('ss', $nome, $permJson);
    }
    if (!$stmt->execute()) {
        respond_json(['ok' => false, 'error' => 'Nome já existente ou erro: ' . $stmt->error], 400);
    }
    respond_json(['ok' => true, 'id' => $id ?: $conn->insert_id]);
}

if ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) respond_json(['ok' => false, 'error' => 'ID obrigatório'], 400);

    // Impede excluir perfil em uso
    $row = $conn->query("SELECT nome FROM profiles WHERE id=$id")->fetch_assoc();
    if ($row) {
        $nome = $conn->real_escape_string($row['nome']);
        $inUse = $conn->query("SELECT COUNT(*) as c FROM users WHERE tipo='$nome'")->fetch_assoc()['c'];
        if ($inUse > 0) {
            respond_json(['ok' => false, 'error' => "Perfil em uso por $inUse usuário(s). Reassigne-os antes de excluir."], 400);
        }
    }
    $stmt = $conn->prepare("DELETE FROM profiles WHERE id=?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    respond_json(['ok' => true]);
}

respond_json(['ok' => false, 'error' => 'Método não permitido'], 405);
