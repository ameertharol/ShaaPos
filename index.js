import mysql from 'mysql2/promise';
import crypto from 'node:crypto';

let pool;
function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured. Add your MySQL connection string in Vercel Project Settings → Environment Variables.');
  if (!pool) pool = mysql.createPool(process.env.DATABASE_URL);
  return pool;
}
function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}
function parseBody(req) {
  if (typeof req.body === 'object' && req.body !== null) return Promise.resolve(req.body);
  return new Promise((resolve,reject)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{})}catch(e){reject(e)}})});
}
function sessionToken() {
  const payload=Buffer.from(JSON.stringify({exp:Date.now()+12*60*60*1000})).toString('base64url');
  const signature=crypto.createHmac('sha256',process.env.SESSION_SECRET||'').update(payload).digest('base64url');
  return payload+'.'+signature;
}
function validSession(req) {
  if (!process.env.SESSION_SECRET) return false;
  const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(v=>v.trim().split(/=(.*)/s).slice(0,2)).filter(v=>v.length===2));
  const token=cookies.pos_session||'';const parts=token.split('.');if(parts.length!==2)return false;
  const expected=crypto.createHmac('sha256',process.env.SESSION_SECRET).update(parts[0]).digest();let received;
  try{received=Buffer.from(parts[1],'base64url')}catch{return false}
  if(received.length!==expected.length||!crypto.timingSafeEqual(received,expected))return false;
  try{return JSON.parse(Buffer.from(parts[0],'base64url').toString()).exp>Date.now()}catch{return false}
}
const docTypes = new Set(['purchase','purchase_return','sale','sale_return','receipt','payment','journal']);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  try {
    const url = new URL(req.url, 'http://localhost');
    const resource = url.searchParams.get('resource') || 'summary';
    if (resource === 'auth') {
      if (req.method === 'GET') return send(res,200,{authenticated:validSession(req),configured:!!(process.env.POS_ADMIN_PASSWORD&&process.env.SESSION_SECRET)});
      if (req.method === 'POST') {
        const body=await parseBody(req);
        if(body.action==='logout'){const secure=process.env.NODE_ENV==='production'?'; Secure':'';res.setHeader('Set-Cookie','pos_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'+secure);return send(res,200,{ok:true})}
        if(!process.env.POS_ADMIN_PASSWORD||!process.env.SESSION_SECRET)return send(res,503,{error:'Set POS_ADMIN_PASSWORD and SESSION_SECRET in your deployment environment before signing in.'});
        const expected=Buffer.from(process.env.POS_ADMIN_PASSWORD);const provided=Buffer.from(String(body.password||''));
        if(expected.length!==provided.length||!crypto.timingSafeEqual(expected,provided))return send(res,401,{error:'Incorrect admin password.'});
        const secure=process.env.NODE_ENV==='production'?'; Secure':'';
        res.setHeader('Set-Cookie',`pos_session=${sessionToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secure}`);return send(res,200,{ok:true});
      }
      return send(res,405,{error:'Method not allowed.'});
    }
    if (!validSession(req)) return send(res,401,{error:'Please sign in to use the POS.'});
    const pool = db();

    if (req.method === 'GET') {
      if (resource === 'health') {
        const [rows] = await pool.query('SELECT 1 AS ok');
        return send(res, 200, { ok: rows[0].ok === 1 });
      }
      if (resource === 'summary') {
        const [[sales]] = await pool.query("SELECT COALESCE(SUM(total),0) total, COUNT(*) orders_count FROM documents WHERE type='sale' AND DATE(created_at)=CURRENT_DATE");
        const [[inventory]] = await pool.query('SELECT COALESCE(SUM(stock*cost),0) value, COUNT(*) products_count FROM products WHERE active=1');
        const [[profit]] = await pool.query("SELECT COALESCE(SUM(di.quantity*(di.unit_price-p.cost)),0) amount FROM document_items di JOIN documents d ON d.id=di.document_id JOIN products p ON p.id=di.product_id WHERE d.type='sale' AND DATE(d.created_at)=CURRENT_DATE");
        const [[low]] = await pool.query('SELECT COUNT(*) count FROM products WHERE active=1 AND stock<=reorder_level');
        const [recent] = await pool.query('SELECT d.id,d.doc_no,d.type,d.entity_name,d.created_at,d.total,d.status FROM documents d ORDER BY d.created_at DESC LIMIT 8');
        const [lowStock] = await pool.query('SELECT id,sku,name,stock,reorder_level FROM products WHERE active=1 AND stock<=reorder_level ORDER BY stock LIMIT 8');
        return send(res,200,{sales,inventory,profit:profit.amount,lowStockCount:low.count,recent,lowStock});
      }
      if (resource === 'settings') {
        const key=url.searchParams.get('key');
        const [rows]=key?await pool.execute('SELECT setting_key,setting_value FROM settings WHERE setting_key=?',[key]):await pool.query('SELECT setting_key,setting_value FROM settings');
        return send(res,200,rows.map(r=>({key:r.setting_key,value:typeof r.setting_value==='string'?JSON.parse(r.setting_value):r.setting_value}))); 
      }
      if (resource === 'products') {
        const [rows] = await pool.query('SELECT id,sku,name,category,price,cost,stock,reorder_level,active,created_at FROM products WHERE active=1 ORDER BY name');
        return send(res,200,rows);
      }
      if (resource === 'contacts') {
        const type=url.searchParams.get('type');
        const [rows] = type ? await pool.execute('SELECT id,name,type,email,phone,balance,created_at FROM contacts WHERE type=? ORDER BY name',[type]) : await pool.query('SELECT id,name,type,email,phone,balance,created_at FROM contacts ORDER BY name');
        return send(res,200,rows);
      }
      if (resource === 'accounts') {
        const [rows] = await pool.query('SELECT id,code,name,type,balance,active FROM accounts ORDER BY code');
        return send(res,200,rows);
      }
      if (resource === 'documents' || resource === 'reports' || resource === 'statement') {
        const type=url.searchParams.get('type');
        const from=url.searchParams.get('from'); const to=url.searchParams.get('to');
        const clauses=[]; const params=[];
        if(type){clauses.push('d.type=?');params.push(type)}
        if(from){clauses.push('d.created_at>=?');params.push(from+' 00:00:00')}
        if(to){clauses.push('d.created_at<?');params.push(to+' 00:00:00')}
        const entity=url.searchParams.get('entity');if(entity){clauses.push('d.entity_name LIKE ?');params.push('%'+entity+'%')}
        const where=clauses.length?'WHERE '+clauses.join(' AND '):'';
        const [rows]=await pool.execute(`SELECT d.id,d.doc_no,d.type,d.entity_name,d.created_at,d.total,d.status,d.notes FROM documents d ${where} ORDER BY d.created_at DESC LIMIT 250`,params);
        return send(res,200,rows);
      }
      return send(res,404,{error:'Unknown resource.'});
    }

    const body=await parseBody(req);
    if(req.method==='POST' && resource==='settings'){
      const {key,value}=body;if(!key||!['company','dashboard','documents'].includes(key)||!value||typeof value!=='object')return send(res,400,{error:'A valid settings key and value are required.'});
      await pool.execute('INSERT INTO settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',[key,JSON.stringify(value)]);
      return send(res,200,{message:'Settings saved.'});
    }    if(req.method==='POST' && resource==='products'){
      const {sku,name,category='',price,cost=0,stock=0,reorder_level=5}=body;
      if(!sku||!name||!Number.isFinite(Number(price)))return send(res,400,{error:'SKU, product name and a valid selling price are required.'});
      const [r]=await pool.execute('INSERT INTO products (sku,name,category,price,cost,stock,reorder_level) VALUES (?,?,?,?,?,?,?)',[sku.trim(),name.trim(),category,Number(price),Number(cost),Number(stock),Number(reorder_level)]);
      return send(res,201,{id:r.insertId,message:'Product created.'});
    }
    if(req.method==='POST' && resource==='contacts'){
      const {name,type='customer',email='',phone='',balance=0}=body;
      if(!name||!['customer','supplier'].includes(type))return send(res,400,{error:'A name and customer or supplier type are required.'});
      const [r]=await pool.execute('INSERT INTO contacts (name,type,email,phone,balance) VALUES (?,?,?,?,?)',[name.trim(),type,email,phone,Number(balance)]);
      return send(res,201,{id:r.insertId,message:'Contact created.'});
    }
    if(req.method==='POST' && resource==='accounts'){
      const {code,name,type='asset',balance=0}=body;
      if(!code||!name)return send(res,400,{error:'Account code and name are required.'});
      const [r]=await pool.execute('INSERT INTO accounts (code,name,type,balance) VALUES (?,?,?,?)',[code.trim(),name.trim(),type,Number(balance)]);
      return send(res,201,{id:r.insertId,message:'Account created.'});
    }
    if(req.method==='POST' && resource==='documents'){
      const {type,entity_id=null,entity_name='',items=[],total,notes=''}=body;
      if(!docTypes.has(type))return send(res,400,{error:'Select a valid document type.'});
      if(!Number.isFinite(Number(total))||Number(total)<0)return send(res,400,{error:'Enter a valid document amount.'});
      if(!Array.isArray(items)||items.some(item=>!Number.isFinite(Number(item.quantity))||Number(item.quantity)<=0||!Number.isFinite(Number(item.unit_price))||Number(item.unit_price)<0))return send(res,400,{error:'Each stock line needs a positive quantity and non-negative unit price.'});
      const conn=await pool.getConnection();
      try{
        await conn.beginTransaction();
        const [settingsRows]=await conn.execute("SELECT setting_value FROM settings WHERE setting_key='documents'");
        const preferences=settingsRows.length?(typeof settingsRows[0].setting_value==='string'?JSON.parse(settingsRows[0].setting_value):settingsRows[0].setting_value):{};
        const prefix=preferences[{purchase:'purchase_prefix',purchase_return:'purchase_return_prefix',sale:'sale_prefix',sale_return:'sale_return_prefix',receipt:'receipt_prefix',payment:'payment_prefix',journal:'journal_prefix'}[type]]||{purchase:'PUR-',purchase_return:'PRT-',sale:'INV-',sale_return:'SRT-',receipt:'RCT-',payment:'PAY-',journal:'JRN-'}[type];
        const [last]=await conn.execute('SELECT COUNT(*) n FROM documents WHERE type=?',[type]);
        const docNo=`${prefix}${String(Number(last[0].n)+1).padStart(5,'0')}`;
        const [d]=await conn.execute('INSERT INTO documents (doc_no,type,entity_id,entity_name,total,status,notes) VALUES (?,?,?,?,?,?,?)',[docNo,type,entity_id,entity_name||'Walk-in customer',Number(total),body.status||'posted',notes]);
        for(const item of items){
          const qty=Number(item.quantity||0),price=Number(item.unit_price||0);
          if(item.product_id&&qty>0){
            const [[product]]=await conn.execute('SELECT id,name FROM products WHERE id=? FOR UPDATE',[item.product_id]);
            if(!product)throw new Error('A selected product no longer exists.');
            await conn.execute('INSERT INTO document_items (document_id,product_id,product_name,quantity,unit_price,line_total) VALUES (?,?,?,?,?,?)',[d.insertId,product.id,product.name,qty,price,qty*price]);
            const stockDelta={purchase:qty,purchase_return:-qty,sale:-qty,sale_return:qty}[type]||0;
            if(stockDelta){const [[stockRow]]=await conn.execute('SELECT stock FROM products WHERE id=? FOR UPDATE',[product.id]);if(Number(stockRow.stock)+stockDelta<0)throw new Error(`Insufficient stock for ${product.name}. Available: ${stockRow.stock}.`);await conn.execute('UPDATE products SET stock=stock+? WHERE id=?',[stockDelta,product.id]);}
          }
        }
        await conn.commit();return send(res,201,{id:d.insertId,doc_no:docNo,message:'Document saved.'});
      }catch(err){await conn.rollback();throw err}finally{conn.release()}
    }
    return send(res,405,{error:'Method not allowed for this resource.'});
  } catch (err) {
    console.error('POS API error:',err);
    const status=err.code==='ER_DUP_ENTRY'?409:500;
    return send(res,status,{error:err.code==='ER_DUP_ENTRY'?'That SKU or account code already exists.':err.message||'Unexpected server error.'});
  }
};


