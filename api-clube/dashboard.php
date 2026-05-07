<?php
require __DIR__ . '/_common.php';

$user = club_require_auth();

$stmt = $conn->prepare("
    SELECT id, patient_id, nome, email, telefone, pontos, pontos_total, nivel, status
    FROM club_users
    WHERE id = ?
    LIMIT 1
");
$stmt->bind_param("i", $user['id']);
$stmt->execute();
$res = $stmt->get_result();
$clubUser = $res ? $res->fetch_assoc() : null;
$stmt->close();

if (!$clubUser) {
    club_respond(["ok" => false, "error" => "Usuário do clube não encontrado"], 404);
}

$stmt = $conn->prepare("
    SELECT id, tipo, pontos, origem, descricao, referencia_id, created_at
    FROM club_points_log
    WHERE club_user_id = ?
    ORDER BY created_at DESC
    LIMIT 10
");
$stmt->bind_param("i", $clubUser['id']);
$stmt->execute();
$res = $stmt->get_result();

$history = [];
if ($res) {
    while ($row = $res->fetch_assoc()) {
        $history[] = $row;
    }
}
$stmt->close();

$points = (int)($clubUser['pontos'] ?? 0);
$total = (int)($clubUser['pontos_total'] ?? 0);

$levels = [
    "Bronze" => 1000,
    "Prata" => 2500,
    "Ouro" => 5000,
    "Diamante" => 10000
];

$currentLevel = $clubUser['nivel'] ?? 'Bronze';
$nextLevel = null;
$nextGoal = null;

foreach ($levels as $levelName => $goal) {
    if ($goal > $points) {
        $nextLevel = $levelName;
        $nextGoal = $goal;
        break;
    }
}

if (!$nextLevel) {
    $nextLevel = "Máximo";
    $nextGoal = $points;
}

$progressPercent = 0;
$missingPoints = 0;

if ($nextGoal > 0 && $nextLevel !== "Máximo") {
    $base = 0;
    if ($currentLevel === 'Prata') $base = 1000;
    if ($currentLevel === 'Ouro') $base = 2500;
    if ($currentLevel === 'Diamante') $base = 5000;

    $range = max(1, $nextGoal - $base);
    $currentInRange = max(0, $points - $base);
    $progressPercent = min(100, round(($currentInRange / $range) * 100));
    $missingPoints = max(0, $nextGoal - $points);
} else {
    $progressPercent = 100;
    $missingPoints = 0;
}

club_respond([
    "ok" => true,
    "user" => [
        "id" => (int)$clubUser['id'],
        "patient_id" => $clubUser['patient_id'],
        "nome" => $clubUser['nome'],
        "email" => $clubUser['email'],
        "telefone" => $clubUser['telefone'],
        "pontos" => $points,
        "pontos_total" => $total,
        "nivel" => $clubUser['nivel'],
        "status" => $clubUser['status']
    ],
    "progress" => [
        "next_level" => $nextLevel,
        "next_goal" => $nextGoal,
        "progress_percent" => $progressPercent,
        "missing_points" => $missingPoints
    ],
    "history" => $history
]);
