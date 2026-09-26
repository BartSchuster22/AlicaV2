"""Raw Telegram ingress, isolated gateway only; no LLM/normalized message input."""
import hashlib
import re
import os
import socket
import ssl
import struct
import time
import ipaddress
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
    # One monotonic budget for setup/connect/TLS/pin/write/close_notify.
    # No resolver: trusted numeric address is distinct from TLS hostname.
    deadline = time.monotonic() + 2.0
    def remaining():
        left = deadline - time.monotonic()
        if left <= 0:
            raise TimeoutError('owner ingress delivery deadline')
        return left
    numeric = config['numeric_endpoint']
    if type(numeric) is not str or '%' in numeric:
        raise ValueError('unscoped numeric endpoint required')
    address = ipaddress.ip_address(numeric)
    port = config['port']
    if type(port) is not int or not 1 <= port <= 65535:
        raise ValueError('port required')
    hostname = config['server_name']
    if type(hostname) is not str or not hostname:
        raise ValueError('TLS hostname required')
    pin = config['receiver_certificate_sha256']
    if re.fullmatch('[0-9a-f]{64}', pin) is None:
        raise ValueError('receiver pin required')
    ctx = ssl.create_default_context(cafile=config['ca_file'])
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    ctx.load_cert_chain(config['client_cert_file'], config['client_key_file'])
    remaining()
    # connect on validated numeric literals bypasses getaddrinfo entirely.
    family = socket.AF_INET if address.version == 4 else socket.AF_INET6
    endpoint = (str(address), port) if address.version == 4 else (str(address), port, 0, 0)
    raw = socket.socket(family, socket.SOCK_STREAM)
    channel = None
    try:
        raw.settimeout(remaining())
        raw.connect(endpoint)
        remaining()
        channel = ctx.wrap_socket(raw, server_hostname=hostname, do_handshake_on_connect=False)
        channel.settimeout(remaining())
        channel.do_handshake()
        remaining()
        if hashlib.sha256(channel.getpeercert(binary_form=True)).hexdigest() != pin:
            raise ValueError('receiver identity mismatch')
        channel.settimeout(remaining())
        channel.sendall(frame)
        channel.settimeout(remaining())
        # No swallowed timeout or claimed ACK. EOF may reach the peer even if
        # shutdown fails; transport delivery is not transactional.
        plain = channel.unwrap()
        plain.close()
        remaining()
    finally:
        try:
            if channel is not None:
                channel.close()
        finally:
            raw.close()
    # Scheduler latency/credential file I/O are not hard resource guarantees.

async def ingest_raw_confirmation(update):
    global _BUSY
    frame = encode_raw_confirmation(update, CONFIG)
    if frame is None:
        return False
    # One in-flight delivery; no unbounded queue or executor accumulation.
    if _BUSY:
        return True
    _BUSY = True
    # Synchronous bounded socket operations in the isolated raw-only gateway.
    # No worker thread/executor/detached task can outlive cancellation or own slot.
    # Cancellation cannot interrupt this synchronous region. It may block the
    # event loop for budget plus scheduler/credential-I/O latency: deployment gate.
    try:
        _send(frame, CONFIG)
    except Exception:
        pass
    finally:
        _BUSY = False
    return True  # consumed, NOT delivery/authorization/durability acknowledgement
