"""Raw Telegram ingress, isolated gateway only; no LLM/normalized message input."""
import asyncio
import hashlib
import re
import os
import socket
import ssl
import struct
from .g7_owner_ingress_config import CONFIG
_BUSY = False
_PATTERN = re.compile(r"explicit owner confirmation\nCellID=[A-Za-z0-9][A-Za-z0-9_-]{0,127}\nSHA256=sha256:[0-9a-f]{64}\npurpose=historical rotation pins only\ngenesis/latest/expected independently established", re.ASCII)

def encode_raw_confirmation(update, config):
    if not config:
        return None
    # Isolated identities are explicit trusted deployment inputs, not message claims.
    ids = [config.get(k) for k in ('gateway_uid', 'receiver_uid', 'candidate_uid')]
    if any(type(v) is not int or v < 0 for v in ids) or len(set(ids)) != 3 or os.getuid() != ids[0]:
        return None
    # Pins must be explicit separately supplied numbers, never fallback to chat.
    if any(type(config.get(k)) is not int or config[k] <= 0 for k in ('owner_sender_id', 'private_chat_id')):
        return None
    for field in ('edited_message', 'channel_post', 'edited_channel_post', 'business_message', 'edited_business_message', 'callback_query'):
        if getattr(update, field, None) is not None:
            return None
    msg = getattr(update, 'message', None)
    if msg is None:
        return None
    sender, chat = getattr(msg, 'from_user', None), getattr(msg, 'chat', None)
    if sender is None or chat is None or getattr(sender, 'is_bot', None) is not False:
        return None
    if (type(sender.id) is not int or type(chat.id) is not int or sender.id != config['owner_sender_id'] or
            chat.id != config['private_chat_id'] or chat.type != 'private'):
        return None
    for field in ('edit_date', 'forward_origin', 'forward_date', 'forward_from', 'forward_from_chat', 'forward_sender_name',
                  'sender_chat', 'via_bot', 'business_connection_id', 'external_reply', 'quote'):
        if getattr(msg, field, None) is not None:
            return None
    if getattr(msg, 'is_automatic_forward', False):
        return None
    text = getattr(msg, 'text', None)
    if type(text) is not str or len(text) > 2048 or _PATTERN.fullmatch(text) is None:
        return None
    body = text.encode('ascii')
    return struct.pack('!I', len(body)) + body

def _send(frame, config):
    # Existing independently provisioned credentials ONLY. No new signing/keygen.
    # CA verification AND exact receiver certificate pin; default no session reuse.
    pin = config['receiver_certificate_sha256']
    if re.fullmatch('[0-9a-f]{64}', pin) is None:
        raise ValueError('receiver pin required')
    ctx = ssl.create_default_context(cafile=config['ca_file'])
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    ctx.load_cert_chain(config['client_cert_file'], config['client_key_file'])
    with socket.create_connection((config['host'], config['port']), timeout=2) as raw:
        with ctx.wrap_socket(raw, server_hostname=config['server_name']) as channel:
            if hashlib.sha256(channel.getpeercert(binary_form=True)).hexdigest() != pin:
                raise ValueError('receiver identity mismatch')
            channel.sendall(frame)
            # TLS close_notify provides the single-frame EOF; no app ACK or
            # durability claim. unwrap waits at most socket timeout.
            try:
                channel.unwrap().close()
            except (ssl.SSLError, TimeoutError):
                pass

def _delivery_finished(task):
    global _BUSY
    _BUSY = False
    if not task.cancelled():
        task.exception()  # consume errors, never log private message/credential data

async def ingest_raw_confirmation(update):
    global _BUSY
    frame = encode_raw_confirmation(update, CONFIG)
    if frame is None:
        return False
    # One in-flight delivery; no unbounded queue or executor accumulation.
    if _BUSY:
        return True
    _BUSY = True
    # Do not log private contents; failures cannot create confirmation records.
    task = asyncio.create_task(asyncio.to_thread(_send, frame, CONFIG))
    task.add_done_callback(_delivery_finished)
    try:
        # Cancelling a Telegram handler must not free the single-delivery slot
        # while its thread is still using the authenticated socket.
        await asyncio.shield(task)
    except Exception:
        pass
    return True  # consumed, NOT a delivery/authorization acknowledgement
