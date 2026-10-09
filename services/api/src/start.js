import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const envPath=fileURLToPath(new URL('../../../.env',import.meta.url));
if(fs.existsSync(envPath))process.loadEnvFile(envPath);
const {buildServer}=await import('./server.js');
const app=buildServer();
await app.listen({port:Number(process.env.PORT||4300),host:process.env.HOST||'127.0.0.1'});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();process.exit(0);});
