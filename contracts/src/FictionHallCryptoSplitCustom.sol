// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract FictionHallCryptoSplitCustom is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant ARBITRUM_ONE_CHAIN_ID = 42161;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    bytes32 public constant PURCHASE_TYPEHASH = keccak256("Purchase(bytes32 orderId,bytes32 itemId,bytes32 readerRef,address writer,address token,uint256 tokenAmount,uint8 splitId,uint16 platformBps,uint64 deadline,uint256 nonce)");
    struct Purchase { bytes32 orderId; bytes32 itemId; bytes32 readerRef; address writer; address token; uint256 tokenAmount; uint64 deadline; uint256 nonce; }
    address public immutable platformTreasury;
    address public immutable quoteSigner;
    mapping(address => bool) public supportedToken;
    mapping(bytes32 => bool) public orderUsed;
    error InvalidConfiguration(); error InvalidSplit(); error UnsupportedToken(); error ExpiredQuote(); error UsedOrder(); error InvalidQuoteSignature();
    event CryptoCustomPurchase(bytes32 indexed orderId, bytes32 indexed itemId, bytes32 indexed readerRef, address payer, address writer, address token, uint8 splitId, uint256 tokenAmount, uint256 platformAmount);

    constructor(address platformTreasury_, address quoteSigner_, address[3] memory tokens_) EIP712("Fiction Hall Crypto Checkout", "1") {
        if (block.chainid != ARBITRUM_ONE_CHAIN_ID || platformTreasury_ == address(0) || quoteSigner_ == address(0)) revert InvalidConfiguration();
        platformTreasury = platformTreasury_; quoteSigner = quoteSigner_;
        for (uint256 i; i < tokens_.length; ++i) { if (tokens_[i] == address(0) || supportedToken[tokens_[i]]) revert InvalidConfiguration(); supportedToken[tokens_[i]] = true; }
    }
    function splitA(Purchase calldata p, bytes calldata s) external nonReentrant { _execute(p,s,1500,0); }
    function splitB(Purchase calldata p, bytes calldata s) external nonReentrant { _execute(p,s,2000,1); }
    function splitC(Purchase calldata p, bytes calldata s) external nonReentrant { _execute(p,s,2200,2); }
    function splitD(Purchase calldata p, bytes calldata s) external nonReentrant { _execute(p,s,2300,3); }
    function splitE(Purchase calldata p, bytes calldata s) external nonReentrant { _execute(p,s,1100,4); }
    function splitF(Purchase calldata p, bytes calldata s) external nonReentrant { _execute(p,s,800,5); }
    function splitG(Purchase calldata p, bytes calldata s) external nonReentrant { _execute(p,s,350,6); }
    function splitCustom(Purchase calldata p, uint16 bps, bytes calldata s) external nonReentrant { _execute(p,s,bps,7); }
    function _execute(Purchase calldata p, bytes calldata s, uint16 bps, uint8 splitId) private {
        if (bps > BPS_DENOMINATOR || p.writer == address(0) || p.tokenAmount == 0) revert InvalidConfiguration();
        if (block.timestamp > p.deadline) revert ExpiredQuote(); if (orderUsed[p.orderId]) revert UsedOrder(); if (!supportedToken[p.token]) revert UnsupportedToken();
        bytes32 h = keccak256(abi.encode(PURCHASE_TYPEHASH,p.orderId,p.itemId,p.readerRef,p.writer,p.token,p.tokenAmount,splitId,bps,p.deadline,p.nonce));
        if (ECDSA.recover(_hashTypedDataV4(h),s) != quoteSigner) revert InvalidQuoteSignature();
        orderUsed[p.orderId] = true; uint256 fee = Math.mulDiv(p.tokenAmount,bps,BPS_DENOMINATOR); IERC20 t = IERC20(p.token);
        t.safeTransferFrom(msg.sender,p.writer,p.tokenAmount-fee); t.safeTransferFrom(msg.sender,platformTreasury,fee);
        emit CryptoCustomPurchase(p.orderId,p.itemId,p.readerRef,msg.sender,p.writer,p.token,splitId,p.tokenAmount,fee);
    }
}
