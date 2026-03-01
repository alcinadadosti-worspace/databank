const admin = require('firebase-admin');

const serviceAccount = {
  projectId: 'databank-6943c',
  clientEmail: 'firebase-adminsdk-fbsvc@databank-6943c.iam.gserviceaccount.com',
  privateKey: `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDIKGLF8V3vQ1Rd
rAC8Gqb7i6+oF8pWeSGWCuFMgnNEpt89ufZtzxM4VA56IywiI45ALz4XXmQkHksk
rpNKvBQAE3AMgfydoOSQiakGbxs8N4TI1csFMVIgkRLM0I8qTqGpRUdgnDhvXkZp
aD0C8K+BQTvcM/p4qlvUucpnVC6anVg5QNnNmBkbnrGorwOMQTvRoRZO+0L1hnlD
e+jtQlTDuCIMizl581gD7QNfvsGkd5QNwqyPmx6jAQzOLaUN3gO/GShV+cu4oAiY
wU98hJlyr3sGGQKJyJRe+SqvDSi4UgG2ee44uwL1aZOe0eg84pz0jsMRZKRghicY
rpJ8iprlAgMBAAECggEAFyeg4ZA+EydBU8LJpPkaVyA+Nl5mMGG78m0Yyi6PIiKB
0dS4/tQFP69tq1B1Uw+07ZTphG+NeyYsADbX4D3ovGeDP1csP5n0xwm9zXo99tXf
XRJqdZPSkeTmfV4lKbpF9lyG2NTJrIyF7by6ziPE0dmXkK5Mq/fdPrstgI2bBJS5
hzfMgDl6mzAU9mFvgjEin0eLOPSE19fowOR76dvU/qNI/2ZpbqB3uOoxcvM6plwN
2nxrqGl/eF+KBQ9EbRGbGbcmCT5rHf5xe0HvvVQnbbdbyzPCmT6zDv4npxmm3mNP
/CnHqcq/Gw/WVZJuKfx/O7dnKVOVvpRgfcMEJs+LwwKBgQD8megIO8/weHw8EYkI
mRM8oNzE3ibQJXipCwRwnD0547GbD9Xh/5RjwZLbE1p4lX9Paoi7WrYrm+CHLckj
WIfX4qwPNXumiz1dUwEqDnLwbaS+qlMgH7LqGFKvE0ALAsmuTMM3++xHoQ4drF7e
zwqsqoJVI2DO715W3WvsL7pwHwKBgQDK2dYRViatNySuzxGoGYiQinYzEWGIBc0y
tP05qxEQMGWgNFMe86V2pvH1eaH5JbRfoerFowBWfbsxTvjcH5kxIndWd5ySzYmV
7OFSYYdCiwRwIPeLbpUW3Lwa9eWHu/nNWCEdnGc9vem427c0BzjS7BJxpzcjsKqA
/nJhoAHEewKBgQCE9IFT7B+L4+8IMvacxu2AKO9q0788Kazz1O+2UhZL5RPzmQcr
2DmDtDyXAP3KoG2NIHbtnlZqZ7ZrkGbhKtT9hbqomq8Fvx5Cg9EGEOrgr+VZ0g7E
xsqGOt0yd4BrC0Gac58BVaFNJnFmnvakcfedYHPV/q5kPZn5E3M2GZaYwKBgBMj
QB38mcOHy08uvAS2+/pfBc3FmwUBPx3Ek4toR0DWwA/AQANQi1DJaVR2eECQPRc0
qHii6zo9vHZnc/UYihRnowimWkBDYfKiGZPzHZa6lN2bTp95/Fje1GRaxJ/srSGh
aeZoRhk+HJnTKNKgx8ymdwr/8qTMWxm2Z8YsGV6XAoGBAKwkqKgOv9YMTLGSAzYd
B4/4QRoBOYcNZGm2JisNfF3MYn+ES/zqtuE4NdIZLJLxXmfxOnESyoFkTesyHwua
H0al+Qi44dFBIJ+NLHEBGHNGqyLy0Jy4DDYf/VCI0vxPX/0DV9pcYo67QxtMPCgC
z41X6OHl7HcVN5Az33xQ6Kca
-----END PRIVATE KEY-----`
};

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function getHierarchy() {
  const leadersSnap = await db.collection('leaders').orderBy('id').get();
  const leaders = [];
  leadersSnap.forEach(doc => leaders.push(doc.data()));

  const employeesSnap = await db.collection('employees').get();
  const employees = [];
  employeesSnap.forEach(doc => employees.push(doc.data()));

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    HIERARQUIA DATABANK                         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('=== GESTORES ===\n');
  for (const l of leaders) {
    const empCount = employees.filter(e => e.leader_id === l.id).length;
    const sector = l.sector || 'N/A';
    const slack = l.slack_id ? 'Sim' : 'Nao';
    console.log(`ID ${l.id}: ${l.name}`);
    console.log(`   Setor: ${sector} | Slack: ${slack} | Colaboradores: ${empCount}`);
    console.log('');
  }

  console.log('\n=== COLABORADORES POR GESTOR ===\n');
  for (const l of leaders) {
    const emps = employees.filter(e => e.leader_id === l.id).sort((a,b) => a.name.localeCompare(b.name));
    if (emps.length > 0) {
      console.log(`┌─ ${l.name} (${emps.length} colaboradores)`);
      console.log('│');
      for (let i = 0; i < emps.length; i++) {
        const e = emps[i];
        const flags = [];
        if (e.is_apprentice) flags.push('Aprendiz');
        if (e.works_saturday === false) flags.push('Nao trabalha sabado');
        if (e.no_punch_required) flags.push('Sem ponto');
        const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
        const prefix = i === emps.length - 1 ? '└──' : '├──';
        console.log(`${prefix} ${e.name}${flagStr}`);
      }
      console.log('');
    }
  }

  // Summary
  console.log('\n=== RESUMO ===\n');
  console.log(`Total de Gestores: ${leaders.length}`);
  console.log(`Total de Colaboradores: ${employees.length}`);

  const withSlack = employees.filter(e => e.slack_id).length;
  const apprentices = employees.filter(e => e.is_apprentice).length;
  const noSaturday = employees.filter(e => e.works_saturday === false).length;
  const noPunch = employees.filter(e => e.no_punch_required).length;

  console.log(`Com Slack ID: ${withSlack}`);
  console.log(`Aprendizes: ${apprentices}`);
  console.log(`Nao trabalham sabado: ${noSaturday}`);
  console.log(`Sem ponto obrigatorio: ${noPunch}`);
}

getHierarchy().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
