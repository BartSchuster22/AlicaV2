async def _handle_text_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle incoming text messages.

    Telegram clients split long messages into multiple updates.  Buffer
    rapid successive text messages from the same user/chat and aggregate
    them into a single MessageEvent before dispatching.
    """
    # Raw authenticated Telegram boundary, before normalization/aggregation.
    if await ingest_raw_confirmation(update):
        return
    msg = self._effective_update_message(update)
    if not msg or not msg.text:
        return
    if not self._should_process_message(msg):
        if self._should_observe_unmentioned_group_message(msg):
            self._observe_unmentioned_group_message(msg, MessageType.TEXT, update_id=update.update_id)
        return
    await self._ensure_forum_commands(update.message)

    event = self._build_message_event(msg, MessageType.TEXT, update_id=update.update_id)
    event.text = self._clean_bot_trigger_text(event.text)
    event = self._apply_telegram_group_observe_attribution(event)
    self._enqueue_text_event(event)

