# Demo Scenarios

This cheat sheet helps you showcase the WhatsApp chatbot from first hello through owner approval. Adapt the copy to match the tenant you are demoing.

---

## Scenario A – New customer books Haircut

1. **Customer:** “היי, אפשר לקבוע תור לתספורת מחר?”  
2. **Bot (LLM):** Greets in Hebrew (`evaluation.action = SHOW_AVAILABILITY`), returns availability buttons via `presentAvailability`.  
3. **Customer:** taps `Thu 09:00` button.  
4. **Bot:** “Thanks! Waiting for approval for Haircut on Thu, Oct 23, 09:00.” (plus Approve/Reject buttons). Booking stored in `pending_bookings`.
5. **Owner:** taps “Approve (Owner)” in WhatsApp or approves via admin portal.  
6. **Bot:** “Approved ✅ See you Thu, Oct 23 at 09:00.”  
7. **Follow-up:** Show admin portal’s audit log entry for this action.

## Scenario B – Customer requests status update

1. Pending booking exists.  
2. **Customer:** “מה הסטטוס של התור שלי?”  
3. **Bot:** `evaluation.action = PENDING_STATUS` and answers in Hebrew referencing the pending slot.  
4. Owner then approves/rejects to show the full lifecycle.

## Scenario C – Customer changes mind

1. Customer: “צריך לשנות את התור.”  
2. bot -> SHOW_AVAILABILITY + new slots.  
3. Customer selects new slot, pending booking updated.  
4. Owner rejects old booking via admin (audit log shows the change).

## Tips

- Use `default`, `beachside-spa`, or `urban-groomers` tenants for variety (different languages/timezones).  
- Show admin portal features: connect (provide actor/role), edit services, rotate tokens, view audit log.  
- Mention Postgres backing store for analytics, pending bookings, and CRM groundwork.
