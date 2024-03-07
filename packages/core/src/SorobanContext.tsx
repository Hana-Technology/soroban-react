import { Connector, WalletChain, ContractDeploymentInfo } from '@soroban-react/types'
import { createContext } from 'react'

import * as StellarSdk from '@stellar/stellar-sdk'
import { SorobanRpc } from '@stellar/stellar-sdk'

export const defaultSorobanContext: SorobanContextType = {
  appName: undefined,
  chains: [],
  connectors: [],
  server: new SorobanRpc.Server('https://soroban-testnet.stellar.org/'),
  serverHorizon: new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org'),
  async connect() {},
  async disconnect() {},
}

export interface SorobanContextType {
  autoconnect?: boolean
  appName?: string
  chains: WalletChain[]
  connectors: Connector[]
  activeChain?: WalletChain
  address?: string
  activeConnector?: Connector
  server?: SorobanRpc.Server
  serverHorizon?: StellarSdk.Horizon.Server
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  setActiveChain?: (chain: WalletChain) => void
  setActiveConnectorAndConnect?: (connector: Connector) => void
  // Used for contract registry
  deployments?: ContractDeploymentInfo[]
}

export const SorobanContext = createContext<SorobanContextType | undefined>(
  undefined
)
