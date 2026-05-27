<?php
session_start();
require __DIR__ . '/_common.php';
require_auth();

ensure_table($conn, "CREATE TABLE IF NOT EXISTS catalogo_exames (
  id VARCHAR(60) PRIMARY KEY,
  nome VARCHAR(200) NOT NULL,
  preco DECIMAL(10,2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $res  = $conn->query("SELECT id, nome, preco FROM catalogo_exames ORDER BY nome");
    $rows = [];
    while ($r = $res->fetch_assoc()) {
        $r['preco'] = (float)$r['preco'];
        $rows[] = $r;
    }
    respond_json(['ok' => true, 'items' => $rows]);
}

if ($method === 'POST') {
    $d    = json_input();
    $id   = trim((string)($d['id']    ?? ''));
    $nome = substr(trim((string)($d['nome']  ?? '')), 0, 200);
    $preco = (float)($d['preco'] ?? 0);

    if (!$id) $id = uniqid('ex_', true);

    $stmt = $conn->prepare("INSERT INTO catalogo_exames (id, nome, preco)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE nome=VALUES(nome), preco=VALUES(preco)");
    $stmt->bind_param('ssd', $id, $nome, $preco);
    $stmt->execute();
    respond_json(['ok' => true, 'id' => $id]);
}

if ($method === 'DELETE') {
    $id   = trim((string)($_GET['id'] ?? ''));
    if (!$id) respond_json(['ok' => false, 'error' => 'id obrigatorio'], 400);
    $stmt = $conn->prepare("DELETE FROM catalogo_exames WHERE id = ?");
    $stmt->bind_param('s', $id);
    $stmt->execute();
    respond_json(['ok' => true]);
}

respond_json(['ok' => false, 'error' => 'Metodo nao permitido'], 405);
