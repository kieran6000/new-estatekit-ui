-- Seller nurture: no "valuation" or "evaluation". Agents call it different
-- things (an evaluation, a property report, a market analysis), and some
-- can't say "valuation" at all, so the emails say what the seller gets:
-- what their home is worth. Text only: the steps and their order don't change,
-- so leads already in the nurture carry on where they are.
-- Changes only lines still worded as shipped (an account that rewrote one keeps theirs).
update public.workflows
set definition = replace(replace(replace(replace(replace(replace(replace(replace(definition::text,
    'I''m working on your home evaluation and want to get the numbers right.',
    'I''m working out what your home is worth and want to get the numbers right.'),
    'the best guide to what your home is worth is a proper evaluation.',
    'the best guide to what your home is worth is a proper look at it, and at what has sold nearby.'),
    'Choosing the agent with the highest valuation. A high number wins the listing, not the sale.',
    'Choosing the agent who quotes the highest price. A high number wins the listing, not the sale.'),
    'A valuation, without the pressure',
    'What your home is worth, without the pressure'),
    'Some people put off a valuation because they think it means they have to sell. It doesn''t.',
    'Some people put off finding out what their home is worth because they think it means they have to sell. It doesn''t.'),
    'A valuation from me is free and comes with no obligation.',
    'Finding out from me is free and comes with no obligation.'),
    'just opened your email about a free valuation.',
    'just opened your email about finding out what their home is worth.'),
    'or would you still like your home evaluation?',
    'or would you still like to know what your home is worth?')::jsonb,
  updated_at = now()
where name = 'Seller nurture — 8 emails in 8 weeks';
