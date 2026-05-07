<?php
declare(strict_types=1);

require __DIR__ . '/_common.php';

header('Content-Type: application/json; charset=utf-8');

$appointmentId = trim((string)($_GET['appointment_id'] ?? ''));
$groupId = trim((string)($_GET['group_id'] ?? ''));

if ($appointmentId === '' && $groupId === '') {
    echo json_encode(['ok' => false, 'error' => 'Parâmetros ausentes'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($groupId !== '') {
    $stmt = $conn->prepare("
        SELECT action_type, action_token
        FROM appointment_actions
        WHERE appointment_group_id = ?
        ORDER BY id DESC
    ");
    $stmt->bind_param('s', $groupId);
} else {
    $stmt = $conn->prepare("
        SELECT action_type, action_token
        FROM appointment_actions
        WHERE appointment_external_id = ?
        ORDER BY id DESC
    ");
    $stmt->bind_param('s', $appointmentId);
}

$stmt->execute();
$res = $stmt->get_result();

$confirm = null;
$cancel = null;

while ($row = $res->fetch_assoc()) {
    if ($row['action_type'] === 'confirm' && $confirm === null) $confirm = $row['action_token'];
    if ($row['action_type'] === 'cancel' && $cancel === null) $cancel = $row['action_token'];
}

$base = 'https://dralessandra.urqongroup.com.br/api';

echo json_encode([
    'ok' => true,
    'confirm_url' => $confirm ? ($base . '/confirm_appointment.php?token=' . urlencode($confirm)) : null,
    'cancel_url' => $cancel ? ($base . '/cancel_appointment.php?token=' . urlencode($cancel)) : null,
], JSON_UNESCAPED_UNICODE);
