import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import {AUTH_TOKEN_PURPOSES, createAuthTokenService, AuthTokenError, hashAuthToken, isAuthToken} from './authTokenService.js';
import {accountEmailLink} from './authLinks.js';
import {createAuthSessionService} from './authSessionService.js';
import {sendTransactionalEmail} from './email.js';
import {passwordHashCost} from './passwordHashConfig.js';
import {staffLimit} from './staffSeats.js';

export class StaffError extends Error {
  constructor(status, message) {super(message);this.status=status;}
}

const emailOf=value=>typeof value==='string' && value.trim().length<=254 &&
  /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value.trim()) ? value.trim().toLowerCase() : null;
const nameOf=value=>typeof value==='string' && value.trim().length>0 && value.trim().length<=120 ? value.trim() : null;
const validPassword=value=>typeof value==='string' && value.length>=8 && value.length<=1024;

export function createStaffService({database,ownerQuery,tokenService=createAuthTokenService(database),
  sessionService=createAuthSessionService(database),sendEmail=sendTransactionalEmail,
  hashPassword=(password,cost)=>bcrypt.hash(password,cost),environment=process.env,
  now=()=>new Date(),randomUUID=crypto.randomUUID}={}) {
  if(!database || typeof ownerQuery!=='function')throw new TypeError('Staff service requires tenant-bound queries.');
  const transaction=work=>database.transaction(work).immediate();
  const owner=id=>ownerQuery("SELECT id,plan,businessName FROM users WHERE id=? AND ownerId IS NULL AND role='owner'").get(id);
  const entries=id=>ownerQuery(`SELECT u.id,u.firstName,u.email,u.createdAt,i.status FROM users u
    LEFT JOIN staffInvitations i ON i.staffId=u.id AND i.ownerId=u.ownerId
    WHERE u.ownerId=? AND u.role='staff' ORDER BY u.createdAt,u.id`).all(id);
  function list(ownerId) {
    const account=owner(ownerId);
    if(!account)throw new StaffError(404,'Business not found.');
    const limit=staffLimit(account.plan);
    return {plan:account.plan,limit:Number.isFinite(limit)?limit:null,staff:entries(ownerId).map((row,index)=>({
      id:row.id,name:row.firstName,email:row.email,
      status:index>=limit?'suspended':row.status==='pending'?'pending':'active',
      inviteStatus:row.status||'active',
      reason:index>=limit?'This plan does not include this staff seat.':null
    }))};
  }
  async function deliver(account,user,issued) {
    try {
      const link=accountEmailLink(environment,AUTH_TOKEN_PURPOSES.STAFF_INVITE,issued.token);
      const businessName=String(account.businessName||'the business').replace(/[\r\n]/g,' ');
      const result=await sendEmail({to:user.email,subject:'Your office-staff invitation',
        text:`${businessName} invited you to set up your office-staff login: ${link}\n\nThis one-time link expires at ${issued.expiresAt}. If you did not expect this invitation, you can ignore it.`,
        idempotencyKey:'auth/staff_invite/'+hashAuthToken(issued.token)});
      if(result?.accepted!==true)throw Error('Email not accepted.');
    }catch{
      try {tokenService.consume({token:issued.token,purpose:AUTH_TOKEN_PURPOSES.STAFF_INVITE});}catch{}
      throw new StaffError(503,'The invitation email could not be sent. Resend the invitation.');
    }
  }
  async function invite(ownerId,{name,email}={}) {
    const firstName=nameOf(name),address=emailOf(email);
    if(!firstName||!address)throw new StaffError(400,'Enter a name and valid email address.');
    let result;
    try {
      result=transaction(()=>{
        const account=owner(ownerId);
        if(!account)throw new StaffError(404,'Business not found.');
        if(entries(ownerId).length>=staffLimit(account.plan))throw new StaffError(account.plan==='Starter'?403:409,
          account.plan==='Starter'?'Starter includes no staff logins.':'Your plan has no available staff seats.');
        const id=randomUUID(),createdAt=now().toISOString();
        // No password is supplied by the owner; this random value cannot be used to sign in.
        ownerQuery(`INSERT INTO users(id,ownerId,email,passwordHash,firstName,businessName,plan,planStatus,
          timezone,role,createdAt) VALUES(?,?,?,?,?,?,?,?,?,'staff',?)`).run(
          id,ownerId,address,'invite:'+crypto.randomBytes(32).toString('hex'),firstName,account.businessName,
          account.plan,'pending_payment','UTC',createdAt);
        ownerQuery(`INSERT INTO staffInvitations(staffId,ownerId,email,status,createdAt)
          VALUES(?,?,?,'pending',?)`).run(id,ownerId,address,createdAt);
        const issued=tokenService.issue({userId:id,purpose:AUTH_TOKEN_PURPOSES.STAFF_INVITE});
        return {account,user:{id,email:address},issued};
      });
    }catch(error){
      if(error?.code==='SQLITE_CONSTRAINT_UNIQUE')throw new StaffError(409,'This email already belongs to an account.');
      throw error;
    }
    await deliver(result.account,result.user,result.issued);
    return list(ownerId);
  }
  async function resend(ownerId,id) {
    const account=owner(ownerId);
    const row=ownerQuery(`SELECT u.id,u.email,i.status FROM users u JOIN staffInvitations i
      ON i.staffId=u.id AND i.ownerId=u.ownerId AND i.email=u.email
      WHERE u.ownerId=? AND u.id=? AND u.role='staff'`).get(ownerId,id);
    if(!account||!row)throw new StaffError(404,'Pending invitation not found.');
    if(row.status!=='pending')throw new StaffError(409,'This invitation is already active.');
    const issued=tokenService.issue({userId:row.id,purpose:AUTH_TOKEN_PURPOSES.STAFF_INVITE});
    await deliver(account,row,issued);
    return list(ownerId);
  }
  function remove(ownerId,id,{pendingOnly=false}={}) {
    const row=ownerQuery(`SELECT u.id,i.status FROM users u LEFT JOIN staffInvitations i
      ON i.staffId=u.id AND i.ownerId=u.ownerId WHERE u.ownerId=? AND u.id=? AND u.role='staff'`).get(ownerId,id);
    if(!row || (pendingOnly&&row.status!=='pending'))throw new StaffError(404,pendingOnly?'Pending invitation not found.':'Staff login not found.');
    transaction(()=>{
      sessionService.revokeAll(id);
      ownerQuery("DELETE FROM users WHERE ownerId=? AND id=? AND role='staff'").run(ownerId,id);
    });
    return list(ownerId);
  }
  async function accept({token,password}={}) {
    if(!isAuthToken(token)||!validPassword(password))throw new StaffError(400,'This link is invalid or the password is too short.');
    const passwordHash=await hashPassword(password,passwordHashCost(environment));
    try {
      tokenService.consume({token,purpose:AUTH_TOKEN_PURPOSES.STAFF_INVITE},receipt=>{
        // Token possession binds a user first; this is the sole pre-binding lookup.
        const binding=database.prepare("SELECT ownerId FROM users WHERE id=? AND role='staff'").get(receipt.userId);
        if(!binding)throw new AuthTokenError('AUTH_TOKEN_INVALID','This link is invalid or has expired.');
        const row=ownerQuery(`SELECT u.id,u.email,i.email AS invitedEmail,i.status FROM users u
          JOIN staffInvitations i ON i.staffId=u.id AND i.ownerId=u.ownerId
          WHERE u.ownerId=? AND u.id=? AND u.role='staff'`).get(binding.ownerId,receipt.userId);
        if(!row||row.email!==row.invitedEmail||row.status!=='pending')throw new AuthTokenError('AUTH_TOKEN_INVALID','This link is invalid or has expired.');
        ownerQuery("UPDATE users SET passwordHash=?,emailVerifiedAt=? WHERE ownerId=? AND id=? AND email=? AND role='staff'")
          .run(passwordHash,receipt.consumedAt,binding.ownerId,row.id,row.email);
        ownerQuery("UPDATE staffInvitations SET status='active',acceptedAt=? WHERE ownerId=? AND staffId=? AND email=? AND status='pending'")
          .run(receipt.consumedAt,binding.ownerId,row.id,row.email);
        tokenService.invalidateOutstanding({userId:row.id,purpose:AUTH_TOKEN_PURPOSES.STAFF_INVITE});
      });
    }catch(error){
      if(error instanceof AuthTokenError&&error.code==='AUTH_TOKEN_INVALID')throw new StaffError(400,'This link is invalid or has expired.');
      throw error;
    }
    return {ok:true};
  }
  return Object.freeze({list,invite,resend,remove,accept});
}
