<?php
require __DIR__ . '/_common.php';
require __DIR__ . '/_referrals.php';

$user = club_require_auth();

$summary = club_get_referral_summary($conn, (int)$user['id']);

$stmt = $conn->prepare("
    SELECT
        r.id,
        r.referral_code_used,
        r.status,
        r.bonus_referrer_points,
        r.bonus_referred_points,
        r.converted_at,
        r.created_at,
        cu.nome AS indicado_nome,
        cu.email AS indicado_email
    FROM club_referrals r
    LEFT JOIN club_users cu ON cu.id = r.referred_club_user_id
    WHERE r.referrer_club_user_id = ?
    ORDER BY r.created_at DESC
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
    "summary" => $summary,
    "items" => $items
]);
