<?php
require __DIR__ . '/_common.php';
require __DIR__ . '/_referrals.php';

$user = club_require_auth();
$data = club_json_input();

$referralCode = trim($data['referral_code'] ?? '');

$result = club_link_referral_for_user(
    $conn,
    (int)$user['id'],
    (string)$user['patient_id'],
    $referralCode
);

if (!$result['ok']) {
    club_respond($result, 400);
}

club_respond($result);
