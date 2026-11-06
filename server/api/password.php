<?php

require_once __DIR__ . '/_lib.php';

gfic_require_method('POST');

try {
    gfic_require_auth();
    $body = gfic_read_json_body();
    if (!isset($body['password'], $body['newPassword']) || !is_string($body['password']) || !is_string($body['newPassword'])) {
        gfic_error(400, '请求格式错误');
    }
    if (strlen($body['newPassword']) < 12) {
        gfic_error(400, '新口令至少需要 12 位');
    }

    $config = gfic_load_config();
    if (!password_verify($body['password'], $config['passwordHash'])) {
        gfic_error(401, '口令错误');
    }
    $config['passwordHash'] = password_hash($body['newPassword'], PASSWORD_DEFAULT);
    gfic_write_config($config);
    gfic_revoke_sessions();
    gfic_json(array('ok' => true));
} catch (Throwable $error) {
    gfic_error(500, '服务器内部错误');
}
