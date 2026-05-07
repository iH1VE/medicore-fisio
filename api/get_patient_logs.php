<?php
declare(strict_types=1);

require __DIR__ . '/_common.php';

header('Content-Type: application/json; charset=utf-8');

$pacienteId = trim((string)($_GET['paciente_id'] ?? ''));

if ($pacienteId === '') {
    echo json_encode(['ok' => true, 'items' => []], JSON_UNESCAPED_UNICODE);
    exit;
}

$stmt = $conn->prepare("
    SELECT id, paciente_id, paciente_nome, appointment_external_id, group_id, acao, descricao, created_at
    FROM patient_logs
    WHERE paciente_id = ?
    ORDER BY created_at DESC, id DESC
");
$stmt->bind_param('s', $pacienteId);
$stmt->execute();
$res = $stmt->get_result();

$items = [];
while ($row = $res->fetch_assoc()) {
    $items[] = $row;
}

echo json_encode(['ok' => true, 'items' => $items], JSON_UNESCAPED_UNICODE);
