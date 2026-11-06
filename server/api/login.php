<?php

require_once __DIR__ . '/_lib.php';

gfic_require_method('POST');

try {
    $ip = gfic_client_ip();
    $retryAfter = gfic_login_lock_remaining($ip);
    if ($retryAfter > 0) {
        gfic_error(429, '尝试次数过多，已锁定', array('retryAfter' => $retryAfter));
    }

    $body = gfic_read_json_body();
    if (!isset($body['password']) || !is_string($body['password'])) {
        gfic_error(400, '请求格式错误');
    }
    $config = gfic_load_config();
    if (!password_verify($body['password'], $config['passwordHash'])) {
        gfic_register_login_failure($ip);
        gfic_error(401, '口令错误');
    }

    gfic_clear_login_failures($ip);
    $token = gfic_create_session();
    gfic_json(array('ok' => true, 'token' => $token, 'expires' => 7200));
} catch (Throwable $error) {
    gfic_error(500, '服务器内部错误');
}
