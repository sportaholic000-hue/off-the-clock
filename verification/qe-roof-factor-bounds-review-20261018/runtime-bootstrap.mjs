// Test process only. Production sources and module search paths on disk stay unchanged.
import {registerHooks,createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {mkdirSync} from 'node:fs';
const root=new URL('./runtime/',import.meta.url);
const require=createRequire(new URL('package.json',root));
for(const name of ['tmp','books'])mkdirSync(new URL(name+'/',root),{recursive:true});
process.env.TMPDIR=fileURLToPath(new URL('tmp/',root));
process.env.PRICEBOOK_PATH=fileURLToPath(new URL('books/',root));
process.env.DATABASE_PATH=fileURLToPath(new URL('synthetic.sqlite',root));
process.env.NODE_ENV='test';
process.env.DOTENV_CONFIG_PATH=fileURLToPath(new URL('absent.env',root));
process.env.JWT_SECRET='SYNTHETIC_ROOF_FACTOR_BOUNDS_REVIEW_NEVER_LIVE';
registerHooks({resolve(specifier,context,nextResolve){
  try{return nextResolve(specifier,context);}catch(error){
    if(error.code!=='ERR_MODULE_NOT_FOUND'||specifier.startsWith('.')||specifier.startsWith('/')||specifier.includes(':'))throw error;
    return nextResolve(pathToFileURL(require.resolve(specifier)).href,context);
  }
}});
