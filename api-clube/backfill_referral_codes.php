<?php
require __DIR__ . '/_common.php';
require __DIR__ . '/_referrals.php';

$res = $conn->query("SELECT id FROM club_users ORDER BY id ASC");
$total = 0;

if ($res) {
    while ($row = $res->fetch_assoc()) {
        club_ensure_user_referral_code($conn, (int)$row['id']);
        $total++;
    }
}

echo "OK: {$total} usuários processados\n";
