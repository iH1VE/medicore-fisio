<?php
require __DIR__ . '/_common.php';

$user = club_require_auth();

$stmt = $conn->prepare("
    SELECT
        id,
        reward_id,
        reward_nome,
        pontos_gastos,
        status,
        observacao,
        created_at,
        updated_at
    FROM club_redemptions
    WHERE club_user_id = ?
    ORDER BY created_at DESC
");
$stmt->bind_param("i", $user['id']);
$stmt->execute();
$res = $stmt->get_result();

$items = [];
if ($res) {
    while ($row = $res->fetch_assoc()) {
        $items[] = $row;
    }
}
$stmt->close();

club_respond([
    "ok" => true,
    "items" => $items
]);
