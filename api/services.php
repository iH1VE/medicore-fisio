<?php
require __DIR__ . '/_common.php';
require_auth();

ensure_table($conn, "CREATE TABLE IF NOT EXISTS servicos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  external_id VARCHAR(64) NOT NULL UNIQUE,
  nome VARCHAR(255) DEFAULT NULL,
  icone VARCHAR(100) DEFAULT NULL,
  payload_json LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

// Seed: insere os serviços padrão se a tabela estiver vazia
$count = $conn->query("SELECT COUNT(*) as c FROM servicos")->fetch_assoc()['c'];
if ((int)$count === 0) {
    $defaults = [
        ['id' => 's1',  'nome' => 'Fisioterapia Traumato-ortopédica',    'icone' => 'fa-bone'],
        ['id' => 's2',  'nome' => 'Fisioterapia Esportiva',              'icone' => 'fa-dumbbell'],
        ['id' => 's3',  'nome' => 'Fisioterapia Neurológica',            'icone' => 'fa-brain'],
        ['id' => 's4',  'nome' => 'Fisioterapia Neurológica Infantil',   'icone' => 'fa-baby'],
        ['id' => 's5',  'nome' => 'Fisioterapia para Amputados',         'icone' => 'fa-wheelchair'],
        ['id' => 's6',  'nome' => 'Reabilitação Física (público idoso)', 'icone' => 'fa-user-group'],
        ['id' => 's7',  'nome' => 'Fisioterapia Cardiopulmonar',         'icone' => 'fa-heart-pulse'],
        ['id' => 's8',  'nome' => 'Fisioterapia Respiratória',           'icone' => 'fa-lungs'],
        ['id' => 's9',  'nome' => 'Osteopatia',                          'icone' => 'fa-stethoscope'],
        ['id' => 's10', 'nome' => 'Fonoaudiologia',                      'icone' => 'fa-microphone'],
        ['id' => 's11', 'nome' => 'Nutrição',                            'icone' => 'fa-apple-whole'],
        ['id' => 's12', 'nome' => 'Pilates Clínico',                     'icone' => 'fa-person-walking'],
        ['id' => 's13', 'nome' => 'Recovery Esportivo',                  'icone' => 'fa-bolt'],
        ['id' => 's14', 'nome' => 'Liberação Miofascial',                'icone' => 'fa-hand-dots'],
    ];
    $stmt = $conn->prepare("INSERT IGNORE INTO servicos (external_id, nome, icone, payload_json) VALUES (?, ?, ?, ?)");
    foreach ($defaults as $s) {
        $payload = json_encode($s, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $stmt->bind_param('ssss', $s['id'], $s['nome'], $s['icone'], $payload);
        $stmt->execute();
    }
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $res = $conn->query("SELECT external_id, payload_json FROM servicos ORDER BY id ASC");
    respond_json(['ok' => true, 'items' => $res ? map_rows($res) : []]);
}

if ($method === 'POST') {
    $data = json_input();
    if (!$data) respond_json(['ok' => false, 'error' => 'Payload vazio'], 400);
    $externalId  = get_external_id($data);
    $nome        = $data['nome']  ?? null;
    $icone       = $data['icone'] ?? null;
    $payloadJson = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $stmt = $conn->prepare("INSERT INTO servicos (external_id, nome, icone, payload_json)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE nome=VALUES(nome), icone=VALUES(icone), payload_json=VALUES(payload_json)");
    $stmt->bind_param('ssss', $externalId, $nome, $icone, $payloadJson);
    $stmt->execute();
    respond_json(['ok' => true, 'id' => $externalId]);
}

if ($method === 'DELETE') {
    $id = $_GET['id'] ?? '';
    if ($id === '') respond_json(['ok' => false, 'error' => 'ID obrigatório'], 400);
    $stmt = $conn->prepare("DELETE FROM servicos WHERE external_id=?");
    $stmt->bind_param('s', $id);
    $stmt->execute();
    respond_json(['ok' => true]);
}

respond_json(['ok' => false, 'error' => 'Método não permitido'], 405);
