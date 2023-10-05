import { SorobanContextType } from '@soroban-react/core'

import { Sign } from 'crypto'
import * as SorobanClient from 'soroban-client'
import { SorobanRpc } from 'soroban-client'

import type { Tx, Transaction, TxResponse } from './types'

export type SignAndSendArgs = {
  txn: Transaction
  secretKey?: string
  skipAddingFootprint?: boolean
  sorobanContext: SorobanContextType
}

export async function signAndSendTransaction({
  txn,
  secretKey,
  skipAddingFootprint = false,
  sorobanContext,
}: SignAndSendArgs) {
  let networkPassphrase = sorobanContext.activeChain?.networkPassphrase
  let server = sorobanContext.server

  if (!secretKey && !sorobanContext.activeConnector)
    throw Error('signAndSend: no secretKey neither activeConnector')
  if (!server) throw Error('signAndSend: no server')
  if (!networkPassphrase) throw Error('signAndSend: no networkPassphrase')

  // preflight and add the footprint
  if (!skipAddingFootprint) {
    txn = await server.prepareTransaction(txn, networkPassphrase)
    if (!txn) {
      throw new Error('No transaction after adding footprint')
    }
  }

  // // is it possible for `auths` to be present but empty? Probably not, but let's be safe.
  // const auths = simulated.results?.[0]?.auth;
  // let auth_len = auths?.length ?? 0;

  // if (auth_len > 1) {
  //   throw new NotImplementedError("Multiple auths not yet supported");
  // } else if (auth_len == 1) {
  //   // TODO: figure out how to fix with new SorobanClient
  //   // const auth = SorobanClient.xdr.SorobanAuthorizationEntry.fromXDR(auths![0]!, 'base64')
  //   // if (auth.addressWithNonce() !== undefined) {
  //   //   throw new NotImplementedError(
  //   //     `This transaction needs to be signed by ${auth.addressWithNonce()
  //   //     }; Not yet supported`
  //   //   )
  //   // }
  // }

  let signed = ''
  if (secretKey) {
    // User as set a secretKey, txn will be signed using the secretKey
    const keypair = SorobanClient.Keypair.fromSecret(secretKey)
    txn.sign(keypair)
    signed = txn.toXDR()
  } else if (sorobanContext.activeConnector) {
    // User has not set a secretKey, txn will be signed using the Connector (wallet) provided in the sorobanContext
    signed = await sorobanContext.activeConnector.signTransaction(txn.toXDR(), {
      networkPassphrase,
    })
  } else {
    throw new Error(
      'signAndSendTransaction: no secretKey, neither active Connector'
    )
  }

  const transactionToSubmit = SorobanClient.TransactionBuilder.fromXDR(
    signed,
    networkPassphrase
  )

  let tx = transactionToSubmit as Tx
  let secondsToWait = 10

  const raw = await sendTx({ tx, secondsToWait, server })
  // if `sendTx` awaited the inclusion of the tx in the ledger, it used
  // `getTransaction`, which has a `resultXdr` field
  if ('resultXdr' in raw) {
    const getResult = raw as SorobanRpc.GetTransactionResponse
    if (getResult.status !== SorobanRpc.GetTransactionStatus.SUCCESS) {
      console.error(
        'Transaction submission failed! Returning full RPC response.'
      )
      return raw
    }

    return raw.resultXdr.result().toXDR('base64')
  }

  // // otherwise, it returned the result of `sendTransaction`
  // if ("errorResultXdr" in raw) {
  //   const sendResult = raw as SorobanRpc.SendTransactionResponse;
  //   return sendResult.errorResultXdr;
  // }

  // if neither of these are present, something went wrong
  console.error("Don't know how to parse result! Returning full RPC response.")
  return raw
}

export async function sendTx({
  tx,
  secondsToWait,
  server,
}: {
  tx: Tx
  secondsToWait: number
  server: SorobanClient.Server
}): Promise<TxResponse> {
  const sendTransactionResponse = await server.sendTransaction(tx)
  let getTransactionResponse = await server.getTransaction(
    sendTransactionResponse.hash
  )

  const waitUntil = new Date(Date.now() + secondsToWait * 1000).valueOf()

  let waitTime = 1000
  let exponentialFactor = 1.5

  while (
    Date.now() < waitUntil &&
    getTransactionResponse.status === 'NOT_FOUND'
  ) {
    // Wait a beat
    await new Promise(resolve => setTimeout(resolve, waitTime))
    /// Exponential backoff
    waitTime = waitTime * exponentialFactor
    // See if the transaction is complete
    getTransactionResponse = await server.getTransaction(
      sendTransactionResponse.hash
    )
  }

  if (
    getTransactionResponse.status === SorobanRpc.GetTransactionStatus.NOT_FOUND
  ) {
    console.error(
      `Waited ${secondsToWait} seconds for transaction to complete, but it did not. ` +
        `Returning anyway. Check the transaction status manually. ` +
        `Info: ${JSON.stringify(sendTransactionResponse, null, 2)}`
    )
  }

  return getTransactionResponse
}
