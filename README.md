# erc-metatransaction-forwarder
A Forwarder (aka. Bouncer) smart-contract to facilitate meta-transactions via a relayer(s) built in solidity. This contract can serve as the meta abstraction for any type of smart-contract. In the example & tests, I use an ERC20.

### features ###
- nonce collision detection for replay protection (may not be necessary depending on your impl)
- batching for gas efficiency
- whitelisting for both relayers (e.g hotwallet, or Infura), as well as signers (original senders); either can be toggled on/off
- fee (for relayer gas fee) to be paid in either native ERC20 token, or ETH

### tests ###
1. `yarn` (for dependencies)
2. `npm run test:waffle`

(see `/test/Forwarder.test.js` for how a signed transaction is constructed)
