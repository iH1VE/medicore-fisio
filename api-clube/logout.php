<?php
require __DIR__ . '/_common.php';

unset($_SESSION['club_user']);
session_destroy();

club_respond([
    "ok" => true
]);
