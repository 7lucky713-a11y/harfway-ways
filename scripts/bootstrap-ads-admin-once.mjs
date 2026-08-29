import { neon } from '@neondatabase/serverless';

const url=process.env.ADS_DATABASE_URL;
if(!url) throw new Error('ADS_DATABASE_URL missing');
const sql=neon(url);

const before=await sql`SELECT count(*)::int AS n FROM neon_auth."user" WHERE role='admin'`;
const adminBefore=Number(before?.[0]?.n||0);
if(adminBefore>0){
  console.log('[ads-admin-bootstrap]',JSON.stringify({status:'noop_admin_exists',adminBefore}));
  process.exit(0);
}

const owners=await sql`
  SELECT DISTINCT c.owner_user_id
  FROM public.ad_campaigns c
  JOIN neon_auth."user" u ON u.id::text=c.owner_user_id
  WHERE c.title='ソヒ' AND u.role='user'
`;
if(owners.length!==1) throw new Error(`Expected exactly one eligible owner for bootstrap; got ${owners.length}`);
const ownerId=String(owners[0].owner_user_id||'');
if(!ownerId) throw new Error('Eligible owner id missing');

await sql`
  UPDATE neon_auth."user"
  SET role='admin'
  WHERE id::text=${ownerId} AND role='user'
`;

const after=await sql`SELECT count(*)::int AS n FROM neon_auth."user" WHERE role='admin'`;
const adminAfter=Number(after?.[0]?.n||0);
if(adminAfter!==1) throw new Error(`Admin bootstrap verification failed; count=${adminAfter}`);
console.log('[ads-admin-bootstrap]',JSON.stringify({status:'promoted_exactly_one_owner',adminBefore,adminAfter}));
