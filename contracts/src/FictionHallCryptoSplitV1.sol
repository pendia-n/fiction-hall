// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// SAMPLE ONLY — not audited and not ready for production funds.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IUsdPriceFeed {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

/// @title FictionHallCryptoSplitV1
/// @notice Non-upgradeable, atomic ERC-20 payment splitter with eight immutable
///         split rules. The contract never intentionally holds buyer funds.
/// @dev The Fiction Hall backend signs a short-lived quote after checking D1:
///      writer ownership, cryptoOkay, selected token, collection, price and access type.
contract FictionHallCryptoSplitV1 is EIP712, ReentrancyGuard {
    uint256 public constant ARBITRUM_ONE_CHAIN_ID = 42161;
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant USD_DECIMALS = 6;
    uint256 public constant USD_SCALE = 10 ** USD_DECIMALS;

    bytes32 public constant PURCHASE_TYPEHASH = keccak256(
        "Purchase(bytes32 orderId,bytes32 itemId,bytes32 readerRef,address writer,address token,uint256 usdAmountE6,uint8 splitId,uint64 deadline,uint256 nonce)"
    );

    struct TokenConfig {
        IUsdPriceFeed usdFeed;
        uint8 tokenDecimals;
        uint8 feedDecimals;
        bool enabled;
    }

    struct Purchase {
        bytes32 orderId;
        bytes32 itemId;
        bytes32 readerRef;
        address writer;
        address token;
        uint256 usdAmountE6;
        uint64 deadline;
        uint256 nonce;
    }

    address public immutable platformTreasury;
    address public immutable quoteSigner;
    uint48 public immutable maxOracleAge;

    mapping(address token => TokenConfig config) public tokenConfigs;
    mapping(bytes32 orderId => bool used) public orderUsed;

    // Values are the platform's percentage in basis points. They are written
    // once in the constructor and there is deliberately no setter.
    uint16[8] private _platformBps;

    error ZeroAddress();
    error InvalidConfiguration();
    error InvalidSplit();
    error UnsupportedToken();
    error ExpiredQuote();
    error UsedOrder();
    error InvalidQuoteSignature();
    error InvalidOraclePrice();
    error StaleOraclePrice();
    error InsufficientTokenBalance(uint256 available, uint256 required);
    error InsufficientTokenAllowance(uint256 available, uint256 required);

    event CryptoPurchase(
        bytes32 indexed orderId,
        bytes32 indexed itemId,
        bytes32 indexed readerRef,
        address payer,
        address writer,
        address token,
        uint8 splitId,
        uint256 tokenAmount,
        uint256 platformAmount
    );

    /// @param platformTreasury_ LLC wallet receiving the platform share.
    /// @param quoteSigner_ Backend-controlled address signing purchase quotes.
    /// @param maxOracleAge_ Maximum accepted oracle age in seconds.
    /// @param tokens_ Exactly three allowed tokens, intended for USDC/USDT/DAI.
    /// @param usdFeeds_ Token/USD oracle proxy corresponding to each token.
    /// @param platformBps_ Platform share for splitA through splitH.
    constructor(
        address platformTreasury_,
        address quoteSigner_,
        uint48 maxOracleAge_,
        address[3] memory tokens_,
        address[3] memory usdFeeds_,
        uint16[8] memory platformBps_
    ) EIP712("Fiction Hall Crypto Checkout", "1") {
        if (block.chainid != ARBITRUM_ONE_CHAIN_ID) revert InvalidConfiguration();
        if (
            platformTreasury_ == address(0) ||
            quoteSigner_ == address(0) ||
            maxOracleAge_ == 0
        ) revert InvalidConfiguration();

        platformTreasury = platformTreasury_;
        quoteSigner = quoteSigner_;
        maxOracleAge = maxOracleAge_;

        for (uint256 i; i < 3; ++i) {
            if (tokens_[i] == address(0) || usdFeeds_[i] == address(0)) {
                revert ZeroAddress();
            }

            for (uint256 j; j < i; ++j) {
                if (tokens_[i] == tokens_[j]) revert InvalidConfiguration();
            }

            uint8 tokenDecimals = IERC20Metadata(tokens_[i]).decimals();
            uint8 feedDecimals = IUsdPriceFeed(usdFeeds_[i]).decimals();
            if (tokenDecimals > 36 || feedDecimals > 36) {
                revert InvalidConfiguration();
            }

            tokenConfigs[tokens_[i]] = TokenConfig({
                usdFeed: IUsdPriceFeed(usdFeeds_[i]),
                tokenDecimals: tokenDecimals,
                feedDecimals: feedDecimals,
                enabled: true
            });
        }

        for (uint256 i; i < 8; ++i) {
            if (platformBps_[i] > BPS_DENOMINATOR) revert InvalidSplit();
            _platformBps[i] = platformBps_[i];
        }
    }

    function platformBps(uint8 splitId) external view returns (uint16) {
        if (splitId > 7) revert InvalidSplit();
        return _platformBps[splitId];
    }

    function quoteTokenAmount(address token, uint256 usdAmountE6)
        external
        view
        returns (uint256)
    {
        return _tokenAmountForUsd(token, usdAmountE6);
    }

    function splitA(Purchase calldata purchase, bytes calldata signature)
        external
        nonReentrant
    {
        _execute(purchase, signature, 0);
    }

    function splitB(Purchase calldata purchase, bytes calldata signature)
        external
        nonReentrant
    {
        _execute(purchase, signature, 1);
    }

    function splitC(Purchase calldata purchase, bytes calldata signature)
        external
        nonReentrant
    {
        _execute(purchase, signature, 2);
    }

    function splitD(Purchase calldata purchase, bytes calldata signature)
        external
        nonReentrant
    {
        _execute(purchase, signature, 3);
    }

    function splitE(Purchase calldata purchase, bytes calldata signature)
        external
        nonReentrant
    {
        _execute(purchase, signature, 4);
    }

    function splitF(Purchase calldata purchase, bytes calldata signature)
        external
        nonReentrant
    {
        _execute(purchase, signature, 5);
    }

    function splitG(Purchase calldata purchase, bytes calldata signature)
        external
        nonReentrant
    {
        _execute(purchase, signature, 6);
    }

    function splitH(Purchase calldata purchase, bytes calldata signature)
        external
        nonReentrant
    {
        _execute(purchase, signature, 7);
    }

    function _execute(
        Purchase calldata purchase,
        bytes calldata signature,
        uint8 splitId
    ) private {
        if (purchase.writer == address(0)) revert ZeroAddress();
        if (purchase.usdAmountE6 == 0) revert InvalidConfiguration();
        if (block.timestamp > purchase.deadline) revert ExpiredQuote();
        if (orderUsed[purchase.orderId]) revert UsedOrder();

        TokenConfig memory config = tokenConfigs[purchase.token];
        if (!config.enabled) revert UnsupportedToken();

        bytes32 structHash = keccak256(
            abi.encode(
                PURCHASE_TYPEHASH,
                purchase.orderId,
                purchase.itemId,
                purchase.readerRef,
                purchase.writer,
                purchase.token,
                purchase.usdAmountE6,
                splitId,
                purchase.deadline,
                purchase.nonce
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        if (ECDSA.recover(digest, signature) != quoteSigner) {
            revert InvalidQuoteSignature();
        }

        // Mark used before either token call. A revert rolls this write back.
        orderUsed[purchase.orderId] = true;

        uint256 tokenAmount = _tokenAmountForUsd(purchase.token, purchase.usdAmountE6);
        IERC20 token = IERC20(purchase.token);

        uint256 balance = token.balanceOf(msg.sender);
        if (balance < tokenAmount) {
            revert InsufficientTokenBalance(balance, tokenAmount);
        }

        uint256 allowance = token.allowance(msg.sender, address(this));
        if (allowance < tokenAmount) {
            revert InsufficientTokenAllowance(allowance, tokenAmount);
        }

        uint256 platformAmount = Math.mulDiv(
            tokenAmount,
            _platformBps[splitId],
            BPS_DENOMINATOR
        );
        uint256 writerAmount = tokenAmount - platformAmount;

        // Atomic direct transfers: no buyer or writer balance is retained here.
        token.safeTransferFrom(msg.sender, purchase.writer, writerAmount);
        token.safeTransferFrom(msg.sender, platformTreasury, platformAmount);

        _emitPurchase(
            purchase,
            splitId,
            tokenAmount,
            platformAmount
        );
    }

    function _emitPurchase(
        Purchase calldata purchase,
        uint8 splitId,
        uint256 tokenAmount,
        uint256 platformAmount
    ) private {
        emit CryptoPurchase(
            purchase.orderId,
            purchase.itemId,
            purchase.readerRef,
            msg.sender,
            purchase.writer,
            purchase.token,
            splitId,
            tokenAmount,
            platformAmount
        );
    }

    function _tokenAmountForUsd(address token, uint256 usdAmountE6)
        private
        view
        returns (uint256 tokenAmount)
    {
        TokenConfig memory config = tokenConfigs[token];
        if (!config.enabled) revert UnsupportedToken();

        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = config.usdFeed.latestRoundData();

        if (answer <= 0 || updatedAt == 0 || answeredInRound < roundId) {
            revert InvalidOraclePrice();
        }
        if (block.timestamp > updatedAt + maxOracleAge) {
            revert StaleOraclePrice();
        }

        uint256 decimalScale = 10 ** uint256(config.tokenDecimals + config.feedDecimals);
        tokenAmount = Math.mulDiv(
            usdAmountE6,
            decimalScale,
            USD_SCALE * uint256(answer),
            Math.Rounding.Ceil
        );
    }
}
