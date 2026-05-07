<?php
require __DIR__ . '/_common.php';

$user = club_require_auth();

club_respond([
    "ok" => true,
    "user" => $user
]);
