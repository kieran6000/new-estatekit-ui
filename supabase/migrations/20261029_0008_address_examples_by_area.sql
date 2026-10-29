-- The address question's example names a real road in each client's own
-- area, not "14 Loop Street, Midrand" on every page. New pages get "14 Main
-- Road, <their area>" (applyFormPreset). Demo Agent pages keep theirs.
update public.custom_questions q
   set helper_text = x.example
  from public.lead_pages p
  join public.agent_profiles a on a.agent_id = p.agent_id
  join (values
    ('Ansunette Ferreira', 'ansunette-cma',          'e.g. 14 Garsfontein Road, Pretoria East'),
    ('Bennie Bell',        'CMA',                    'e.g. 14 Jean Avenue, Centurion'),
    ('Bennie Bell',        'EK - Evaluation 3APR',   'e.g. 14 Jean Avenue, Centurion'),
    ('Chantal Hoole',      'Home Value',             'e.g. 14 Garsfontein Road, Pretoria East'),
    ('Franko van Zyl',     'futureagent-home-value', 'e.g. 14 Jean Avenue, Centurion'),
    ('Hendrik Jansen',     'grove-home-value',       'e.g. 14 Jean Avenue, Centurion'),
    ('Juani Blom',         'Home Value',             'e.g. 14 Trichardts Road, Boksburg'),
    ('Kieran at EstateKit','Hannaford Homes - Sandton','e.g. 14 Rivonia Road, Sandton'),
    ('Mphokuhle Siziba',   'Seller campaign (13/10/2026)', 'e.g. 14 Shippard Street, Mafikeng'),
    ('Naudé Kritzinger',   'Free Home Evaluation',   'e.g. 14 Lynnwood Road, Pretoria'),
    ('Shoaib Kathrada',    'Home Value',             'e.g. 14 Loop Street, Cape Town'),
    ('Storm Hargreaves',   'cma landing page',       'e.g. 14 New Road, Midrand'),
    ('Zainub Sathaar',     'Home Value',             'e.g. 14 Rooihuiskraal Road, Rooihuiskraal')
  ) as x(agent, page, example) on x.agent = a.display_name and x.page = p.name
 where q.page_id = p.id and q.type = 'address';
