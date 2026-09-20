-- Only two formats now: 'commander' and 'sixty'. Anything else becomes 'sixty',
-- unless the deck has a command-zone card.
UPDATE decks SET format = 'commander' WHERE format <> 'commander' AND id IN (SELECT deck_id FROM deck_cards WHERE board = 'command');
--> statement-breakpoint
UPDATE decks SET format = 'sixty' WHERE format NOT IN ('commander', 'sixty');
