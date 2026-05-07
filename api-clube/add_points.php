<?php
require __DIR__ . '/_common.php';

$user = club_require_auth();
$data = club_json_input();

$tipo = trim($data['tipo'] ?? 'ganho');
$pontos = (int)($data['pontos'] ?? 0);
$origem = trim($data['origem'] ?? 'manual');
$descricao = trim($data['descricao'] ?? 'Lançamento manual');
$referenciaId = trim($data['referencia_id'] ?? '');

if (!in_array($tipo, ['ganho', 'gasto', 'ajuste'], true)) {
    club_respond(["ok" => false, "error" => "Tipo inválido"], 400);
}

if ($pontos <= 0) {
    club_respond(["ok" => false, "error" => "Pontos inválidos"], 400);
}

$clubUserId = (int)$user['id'];
$patientId = $user['patient_id'];

$stmt = $conn->prepare("
    INSERT INTO club_points_log (club_user_id, patient_id, tipo, pontos, origem, descricao, referencia_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
");
$stmt->bind_param("ississs", $clubUserId, $patientId, $tipo, $pontos, $origem, $descricao, $referenciaId);
$ok = $stmt->execute();
$stmt->close();

if (!$ok) {
    club_respond(["ok" => false, "error" => "Erro ao registrar histórico"], 500);
}

if ($tipo === 'ganho' || $tipo === 'ajuste') {
    $stmt = $conn->prepare("
        UPDATE club_users
        SET pontos = pontos + ?, pontos_total = pontos_total + ?
        WHERE id = ?
    ");
    $stmt->bind_param("iii", $pontos, $pontos, $clubUserId);
    $stmt->execute();
    $stmt->close();
}

if ($tipo === 'gasto') {
    $stmt = $conn->prepare("
        UPDATE club_users
        SET pontos = GREATEST(0, pontos - ?)
        WHERE id = ?
    ");
    $stmt->bind_param("ii", $pontos, $clubUserId);
    $stmt->execute();
    $stmt->close();
}

$stmt = $conn->prepare("
    SELECT pontos, pontos_total FROM club_users WHERE id = ? LIMIT 1
");
$stmt->bind_param("i", $clubUserId);
$stmt->execute();
$res = $stmt->get_result();
$row = $res ? $res->fetch_assoc() : null;
$stmt->close();

$currentPoints = (int)($row['pontos'] ?? 0);
$newLevel = 'Bronze';
if ($currentPoints >= 10000) $newLevel = 'Diamante';
elseif ($currentPoints >= 5000) $newLevel = 'Ouro';
elseif ($currentPoints >= 2500) $newLevel = 'Prata';
elseif ($currentPoints >= 1000) $newLevel = 'Bronze';

$stmt = $conn->prepare("UPDATE club_users SET nivel = ? WHERE id = ?");
$stmt->bind_param("si", $newLevel, $clubUserId);
$stmt->execute();
$stmt->close();

club_respond([
    "ok" => true,
    "message" => "Pontuação atualizada com sucesso"
]);
