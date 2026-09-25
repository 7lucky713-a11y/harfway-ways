export const PAGE_SETTINGS_SOURCE='game-note-publications';
export const PAGE_SETTINGS_TYPE='game_note_public_page_settings';
export const PAGE_SETTINGS_ID='game-notes:public-page-settings:notes';
export const PAGE_SETTINGS_INTERNAL_URL='/game-notes/_private/public-page-settings/notes';

export const DEFAULT_PLAY_NOTES_PAGE_SETTINGS=Object.freeze({
  eyebrow:'遊んでいる途中に、書きとめたこと。',
  intro:'遊んで、考えて、引っかかったことを少しずつ。レビューになる前の感想や、まだ答えの出ていないメモを並べています。',
  aboutTitle:'遊んでいる途中の記録。',
  aboutBody:'完成した記事ほどまとまっていなくても、あとから読み返したくなる断片があります。ここは、そんな言葉を置いておく場所です。'
});
const LENGTH_LIMITS={eyebrow:120,intro:500,aboutTitle:120,aboutBody:600};
const isOwn=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);

export function validatePlayNotesPageSettings(value){
  if(!value||typeof value!=='object'||Array.isArray(value)){
    const e=new Error('page_settings_object_required');e.status=400;throw e;
  }
  const result={};
  for(const [key,max] of Object.entries(LENGTH_LIMITS)){
    const raw=value[key];
    if(!isOwn(value,key)||typeof raw!=='string'){
      const e=new Error('page_settings_field_required:'+key);e.status=400;throw e;
    }
    const text=raw.trim();
    if(!text||text.length>max||text.includes('\0')){
      const e=new Error('page_settings_field_invalid:'+key);e.status=400;throw e;
    }
    result[key]=text;
  }
  return result;
}
export function playNotesPageSettingsFromRow(row){
  const data=row?.metadata&&typeof row.metadata==='object'?row.metadata:{};
  const settings={};
  for(const key of Object.keys(DEFAULT_PLAY_NOTES_PAGE_SETTINGS)){
    const raw=data[key];
    settings[key]=typeof raw==='string'&&raw.trim()?raw:DEFAULT_PLAY_NOTES_PAGE_SETTINGS[key];
  }
  return {settings,updatedAt:row?.updated_at||null,usingDefaults:!row};
}
export async function loadPlayNotesPageSettings(sql){
  const rows=await sql`SELECT metadata,updated_at FROM core.contents
    WHERE id=${PAGE_SETTINGS_ID} AND source=${PAGE_SETTINGS_SOURCE}
      AND content_type=${PAGE_SETTINGS_TYPE} AND status='active' LIMIT 1`;
  return playNotesPageSettingsFromRow(rows[0]||null);
}
export async function savePlayNotesPageSettings(sql,value){
  const settings=validatePlayNotesPageSettings(value);
  const metadata=JSON.stringify({...settings,settingsVersion:1});
  const rows=await sql`INSERT INTO core.contents
    (id,content_type,title,url,excerpt,body_text,status,source,metadata,created_at,updated_at)
    VALUES (${PAGE_SETTINGS_ID},${PAGE_SETTINGS_TYPE},'プレイノート公開ページ設定',
      ${PAGE_SETTINGS_INTERNAL_URL},'', '', 'active',${PAGE_SETTINGS_SOURCE},CAST(${metadata} AS jsonb),now(),now())
    ON CONFLICT(id) DO UPDATE SET metadata=EXCLUDED.metadata,status='active',updated_at=now()
    WHERE core.contents.source=${PAGE_SETTINGS_SOURCE} AND core.contents.content_type=${PAGE_SETTINGS_TYPE}
    RETURNING metadata,updated_at`;
  if(!rows[0]){const e=new Error('page_settings_record_conflict');e.status=409;throw e;}
  return playNotesPageSettingsFromRow(rows[0]);
}
