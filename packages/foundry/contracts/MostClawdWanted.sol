// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MostClawdWanted
 * @notice Bounty platform that custodies pooled CLAWD tokens for community-funded
 *         bounties with multiple resolution + claim modes.
 * @dev Frontend reads all data from emitted events (no subgraph). All state-changing
 *      external functions follow CEI and are protected with `nonReentrant`.
 */
contract MostClawdWanted is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -----------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------

    /// @notice CLAWD ERC20 token (18 decimals, no burn function).
    IERC20 public constant CLAWD = IERC20(0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07);

    /// @notice Treasury wallet that receives the treasury split on payout.
    address public constant TREASURY = 0x90eF2A9211A3E7CE788561E5af54C76B0Fa3aEd0;

    /// @notice Burn sink (CLAWD has no burn function, so we transfer here).
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice Minimum claimant payout share (60%).
    uint16 public constant MIN_CLAIMANT_BPS = 6000;
    /// @notice Maximum treasury payout share (20%).
    uint16 public constant MAX_TREASURY_BPS = 2000;
    /// @notice Maximum burn share (20%).
    uint16 public constant MAX_BURN_BPS = 2000;
    /// @notice Total basis points (100%).
    uint16 public constant BPS_DENOMINATOR = 10000;

    // -----------------------------------------------------------------
    // Enums
    // -----------------------------------------------------------------

    enum BountyStatus {
        Open,
        Claimed,
        Submitted,
        Resolved,
        Expired,
        Cancelled
    }

    enum ResolutionMode {
        TrustedJudge,
        PledgerVote,
        Optimistic,
        JudgeWithOverride
    }

    enum ClaimMode {
        FCFS,
        OpenJudgePicks,
        OpenFirstValid
    }

    enum RefundPolicy {
        Refundable,
        Sticky,
        Hybrid
    }

    // -----------------------------------------------------------------
    // Structs
    // -----------------------------------------------------------------

    struct Bounty {
        uint256 id;
        address creator;
        string descriptionCID;
        uint256 createdAt;
        uint256 deadline;
        uint256 totalPledged;
        BountyStatus status;
        // Resolution
        ResolutionMode resolutionMode;
        // Judge fields
        address judge;
        uint256 judgeNominationTime;
        uint256 judgeVetoWindow;
        // Claim
        ClaimMode claimMode;
        address currentClaimant;
        uint256 claimWindow;
        // Refund
        RefundPolicy refundPolicy;
        uint256 refundUnlockTime;
        // Splits
        uint16 claimantBps;
        uint16 treasuryBps;
        uint16 burnBps;
        // Override threshold
        uint16 pledgerOverrideBps;
        // Challenge window
        uint256 challengeWindow;
        // Finalization
        address resolvedClaimant;
        uint256 finalizedAt;
    }

    /// @dev Per-bounty per-claimant state.
    struct ClaimantInfo {
        bool hasClaimed;
        bool hasSubmitted;
        bool approved;
        bool rejected;
        uint256 claimDeadline;
        string proofCID;
    }

    // -----------------------------------------------------------------
    // Storage
    // -----------------------------------------------------------------

    mapping(uint256 bountyId => Bounty) public bounties;
    uint256 public bountyCount;

    /// @notice Per-pledger CLAWD pledge amount per bounty.
    mapping(uint256 bountyId => mapping(address pledger => uint256 amount)) public pledges;

    /// @notice Tracks one-vote-per-address per bounty.
    mapping(uint256 bountyId => mapping(address voter => bool voted)) public hasVoted;

    /// @notice Aggregate pledge-weighted approval for each candidate.
    mapping(uint256 bountyId => mapping(address candidate => uint256 voteWeight)) public voteWeights;

    /// @notice Aggregate pledge-weighted rejection for each candidate.
    mapping(uint256 bountyId => mapping(address candidate => uint256 rejectWeight)) public rejectWeights;

    /// @notice Aggregate pledge-weighted veto tally against currently nominated judge.
    mapping(uint256 bountyId => uint256 weight) public judgeVetoWeight;

    /// @notice Tracks one-veto-per-address per nomination cycle (resets on new nomination).
    mapping(uint256 bountyId => mapping(address voter => uint256 nominationTime)) public lastVetoNomination;

    /// @notice Per-bounty per-claimant info (claim deadline, proof, approval state).
    mapping(uint256 bountyId => mapping(address claimant => ClaimantInfo)) public claimants;

    /// @notice Ordered list of all claimants per bounty (used in open-claim modes).
    mapping(uint256 bountyId => address[]) private _claimantList;

    // -----------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------

    event BountyCreated(
        uint256 indexed id,
        address indexed creator,
        string descriptionCID,
        uint256 deadline,
        ResolutionMode resolutionMode,
        ClaimMode claimMode,
        RefundPolicy refundPolicy,
        uint16 claimantBps,
        uint16 treasuryBps,
        uint16 burnBps,
        uint256 challengeWindow
    );
    event Pledged(uint256 indexed bountyId, address indexed pledger, uint256 amount, uint256 totalPledged);
    event Refunded(uint256 indexed bountyId, address indexed pledger, uint256 amount);
    event JudgeNominated(uint256 indexed bountyId, address indexed judge);
    event JudgeVetoRegistered(uint256 indexed bountyId, address indexed voter, uint256 weight);
    event JudgeVetoed(uint256 indexed bountyId, address indexed previousJudge);
    event Claimed(uint256 indexed bountyId, address indexed claimant);
    event ProofSubmitted(uint256 indexed bountyId, address indexed claimant, string proofCID);
    event Approved(uint256 indexed bountyId, address indexed claimant, address indexed judge);
    event Rejected(uint256 indexed bountyId, address indexed claimant, address indexed judge);
    event Voted(
        uint256 indexed bountyId, address indexed voter, address indexed candidate, bool approve, uint256 weight
    );
    event Finalized(
        uint256 indexed bountyId, address indexed winner, uint256 claimantAmount, uint256 treasuryAmount, uint256 burnAmount
    );
    event Cancelled(uint256 indexed bountyId);
    event BountyExpiredClaim(uint256 indexed bountyId);
    event BountyExpired(uint256 indexed bountyId);

    // -----------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------

    error BountyNotOpen();
    error BountyNotClaimed();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error InvalidSplits();
    error InvalidJudgeVetoWindow();
    error InvalidChallengeWindow();
    error NotCreator();
    error NotJudge();
    error NotClaimant();
    error NotPledger();
    error AlreadyVoted();
    error JudgeIsClaimant();
    error ChallengeWindowNotOver();
    error RefundNotAvailable();
    error InvalidClaimantBps();
    error InvalidTreasuryBps();
    error InvalidBurnBps();
    error InvalidPledgerOverrideBps();
    error InvalidAmount();
    error InvalidDeadline();
    error JudgeSlotTaken();
    error JudgeVetoWindowExpired();
    error JudgeVetoWindowActive();
    error AlreadyClaimed();
    error AlreadySubmitted();
    error AlreadyResolved();
    error NoApprovedClaimant();
    error InvalidResolutionMode();
    error InvalidClaimMode();
    error JudgeNotSet();
    error ZeroAddress();
    error ClaimWindowExpired();

    // -----------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------

    constructor(address initialOwner) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
    }

    // -----------------------------------------------------------------
    // Modifiers / internal helpers
    // -----------------------------------------------------------------

    function _bountyExists(uint256 bountyId) internal view {
        if (bountyId >= bountyCount) revert BountyNotOpen();
    }

    function _isValidWindow(uint256 w) internal pure returns (bool) {
        return w == 1 days || w == 3 days || w == 7 days;
    }

    // -----------------------------------------------------------------
    // Bounty lifecycle
    // -----------------------------------------------------------------

    /**
     * @notice Create a new bounty. Caller becomes the creator.
     * @param descriptionCID IPFS CID for the long-form description.
     * @param deadline Unix timestamp after which the bounty expires.
     * @param resolutionMode Resolution mechanism for awarding the bounty.
     * @param judge Pre-assigned judge address; pass `address(0)` for an open slot.
     * @param judgeVetoWindow Seconds for the pledger veto window after nomination
     *        (must be 1 / 3 / 7 days).
     * @param claimMode How claimants can register their attempt.
     * @param claimWindow Seconds the claimant has to submit proof after claiming
     *        (used in FCFS).
     * @param refundPolicy Pledger refund policy.
     * @param refundUnlockTime Unix timestamp after which refunds become available
     *        (subject to policy).
     * @param claimantBps Claimant payout share (>= 6000).
     * @param treasuryBps Treasury share (<= 2000).
     * @param burnBps Burn share (<= 2000).
     * @param pledgerOverrideBps Threshold for veto / override (basis points of pool).
     * @param challengeWindow Seconds for the post-approval challenge period
     *        (must be 1 / 3 / 7 days).
     * @return bountyId Newly assigned bounty id.
     */
    function createBounty(
        string calldata descriptionCID,
        uint256 deadline,
        ResolutionMode resolutionMode,
        address judge,
        uint256 judgeVetoWindow,
        ClaimMode claimMode,
        uint256 claimWindow,
        RefundPolicy refundPolicy,
        uint256 refundUnlockTime,
        uint16 claimantBps,
        uint16 treasuryBps,
        uint16 burnBps,
        uint16 pledgerOverrideBps,
        uint256 challengeWindow
    ) external nonReentrant returns (uint256 bountyId) {
        // ---- Checks ----
        if (deadline <= block.timestamp) revert InvalidDeadline();

        if (claimantBps < MIN_CLAIMANT_BPS) revert InvalidClaimantBps();
        if (treasuryBps > MAX_TREASURY_BPS) revert InvalidTreasuryBps();
        if (burnBps > MAX_BURN_BPS) revert InvalidBurnBps();
        if (uint256(claimantBps) + uint256(treasuryBps) + uint256(burnBps) != BPS_DENOMINATOR) {
            revert InvalidSplits();
        }
        if (pledgerOverrideBps == 0 || pledgerOverrideBps > BPS_DENOMINATOR) {
            revert InvalidPledgerOverrideBps();
        }

        if (!_isValidWindow(judgeVetoWindow)) revert InvalidJudgeVetoWindow();
        if (!_isValidWindow(challengeWindow)) revert InvalidChallengeWindow();

        // claim window must be > 0 for FCFS and reasonable in general
        if (claimWindow == 0) revert InvalidAmount();

        // ---- Effects ----
        bountyId = bountyCount;
        unchecked {
            bountyCount = bountyId + 1;
        }

        Bounty storage b = bounties[bountyId];
        b.id = bountyId;
        b.creator = msg.sender;
        b.descriptionCID = descriptionCID;
        b.createdAt = block.timestamp;
        b.deadline = deadline;
        b.status = BountyStatus.Open;
        b.resolutionMode = resolutionMode;
        b.judge = judge;
        if (judge != address(0)) {
            // Pre-assigned judge: nomination clock starts immediately so the
            // veto window is well-defined.
            b.judgeNominationTime = block.timestamp;
        }
        b.judgeVetoWindow = judgeVetoWindow;
        b.claimMode = claimMode;
        b.claimWindow = claimWindow;
        b.refundPolicy = refundPolicy;
        b.refundUnlockTime = refundUnlockTime;
        b.claimantBps = claimantBps;
        b.treasuryBps = treasuryBps;
        b.burnBps = burnBps;
        b.pledgerOverrideBps = pledgerOverrideBps;
        b.challengeWindow = challengeWindow;

        emit BountyCreated(
            bountyId,
            msg.sender,
            descriptionCID,
            deadline,
            resolutionMode,
            claimMode,
            refundPolicy,
            claimantBps,
            treasuryBps,
            burnBps,
            challengeWindow
        );
    }

    /**
     * @notice Pledge CLAWD to an open bounty. Requires prior `approve` of CLAWD.
     */
    function pledge(uint256 bountyId, uint256 amount) external nonReentrant {
        // ---- Checks ----
        _bountyExists(bountyId);
        if (amount == 0) revert InvalidAmount();
        Bounty storage b = bounties[bountyId];
        if (b.status != BountyStatus.Open) revert BountyNotOpen();
        if (block.timestamp >= b.deadline) revert DeadlinePassed();

        // ---- Effects ----
        pledges[bountyId][msg.sender] += amount;
        b.totalPledged += amount;
        uint256 newTotal = b.totalPledged;

        // ---- Interactions ----
        CLAWD.safeTransferFrom(msg.sender, address(this), amount);

        emit Pledged(bountyId, msg.sender, amount, newTotal);
    }

    /**
     * @notice Step forward as the judge for an open-slot bounty. Opens the veto window.
     */
    function nominateJudge(uint256 bountyId) external nonReentrant {
        // ---- Checks ----
        _bountyExists(bountyId);
        Bounty storage b = bounties[bountyId];
        if (b.status != BountyStatus.Open) revert BountyNotOpen();
        if (b.judge != address(0)) revert JudgeSlotTaken();
        // Judge cannot also be the current/known claimant (FCFS already locked in).
        if (b.currentClaimant == msg.sender) revert JudgeIsClaimant();
        if (claimants[bountyId][msg.sender].hasClaimed) revert JudgeIsClaimant();

        // ---- Effects ----
        b.judge = msg.sender;
        b.judgeNominationTime = block.timestamp;
        // Reset prior veto tally for the new nomination cycle.
        judgeVetoWeight[bountyId] = 0;

        emit JudgeNominated(bountyId, msg.sender);
    }

    /**
     * @notice Pledger-weighted veto of the currently nominated judge.
     * @dev If the cumulative veto weight crosses `pledgerOverrideBps` of the pool,
     *      the judge slot resets to `address(0)`.
     */
    function vetoJudge(uint256 bountyId) external nonReentrant {
        // ---- Checks ----
        _bountyExists(bountyId);
        Bounty storage b = bounties[bountyId];
        if (b.status != BountyStatus.Open) revert BountyNotOpen();
        if (b.judge == address(0)) revert JudgeNotSet();
        if (block.timestamp > b.judgeNominationTime + b.judgeVetoWindow) {
            revert JudgeVetoWindowExpired();
        }
        uint256 pledgeAmt = pledges[bountyId][msg.sender];
        if (pledgeAmt == 0) revert NotPledger();
        // One veto per nomination cycle.
        if (lastVetoNomination[bountyId][msg.sender] == b.judgeNominationTime) {
            revert AlreadyVoted();
        }

        // ---- Effects ----
        lastVetoNomination[bountyId][msg.sender] = b.judgeNominationTime;
        uint256 newWeight = judgeVetoWeight[bountyId] + pledgeAmt;
        judgeVetoWeight[bountyId] = newWeight;

        emit JudgeVetoRegistered(bountyId, msg.sender, pledgeAmt);

        // threshold = pledgerOverrideBps / 10000 of totalPledged
        uint256 threshold = (b.totalPledged * b.pledgerOverrideBps) / BPS_DENOMINATOR;
        if (newWeight >= threshold && threshold > 0) {
            address previousJudge = b.judge;
            b.judge = address(0);
            b.judgeNominationTime = 0;
            judgeVetoWeight[bountyId] = 0;
            emit JudgeVetoed(bountyId, previousJudge);
        }
    }

    /**
     * @notice Register as a claimant. Behaviour depends on `claimMode`:
     *         - FCFS: locks in the caller as `currentClaimant` for `claimWindow`.
     *         - OpenJudgePicks / OpenFirstValid: appends caller to the claimant list.
     */
    function claim(uint256 bountyId) external nonReentrant {
        // ---- Checks ----
        _bountyExists(bountyId);
        Bounty storage b = bounties[bountyId];
        if (block.timestamp >= b.deadline) revert DeadlinePassed();
        if (msg.sender == b.judge) revert JudgeIsClaimant();
        if (msg.sender == b.creator) revert NotClaimant();

        ClaimantInfo storage ci = claimants[bountyId][msg.sender];

        if (b.claimMode == ClaimMode.FCFS) {
            if (b.status != BountyStatus.Open) revert BountyNotOpen();
            // ---- Effects (FCFS) ----
            b.status = BountyStatus.Claimed;
            b.currentClaimant = msg.sender;
            ci.hasClaimed = true;
            ci.claimDeadline = block.timestamp + b.claimWindow;
            _claimantList[bountyId].push(msg.sender);
        } else {
            // Open modes: status stays Open until a proof is approved/finalized.
            if (b.status != BountyStatus.Open) revert BountyNotOpen();
            if (ci.hasClaimed) revert AlreadyClaimed();
            ci.hasClaimed = true;
            ci.claimDeadline = b.deadline; // open modes use bounty deadline
            _claimantList[bountyId].push(msg.sender);
        }

        emit Claimed(bountyId, msg.sender);
    }

    /// @notice Anyone can call after a FCFS claimant's window expires to reset status to Open.
    function expireClaim(uint256 bountyId) external {
        Bounty storage b = bounties[bountyId];
        if (b.status != BountyStatus.Claimed) revert BountyNotClaimed();
        ClaimantInfo storage ci = claimants[bountyId][b.currentClaimant];
        if (block.timestamp <= ci.claimDeadline) revert ChallengeWindowNotOver();
        // Reset: clear claimant, re-open
        b.status = BountyStatus.Open;
        ci.hasClaimed = false;
        b.currentClaimant = address(0);
        emit BountyExpiredClaim(bountyId);
    }

    /// @notice Anyone can expire a bounty after deadline + challengeWindow if unresolved.
    function expireBounty(uint256 bountyId) external {
        Bounty storage b = bounties[bountyId];
        // Only Open, Claimed, or Submitted bounties can be expired
        if (
            b.status == BountyStatus.Resolved || b.status == BountyStatus.Expired
                || b.status == BountyStatus.Cancelled
        ) revert BountyNotOpen();
        // Must be past deadline + challengeWindow
        if (block.timestamp <= b.deadline + b.challengeWindow) revert ChallengeWindowNotOver();
        b.status = BountyStatus.Expired;
        emit BountyExpired(bountyId);
    }

    /**
     * @notice Submit proof of work for a previously-registered claim.
     * @param proofCID IPFS CID for the proof artifact.
     */
    function submitProof(uint256 bountyId, string calldata proofCID) external nonReentrant {
        // ---- Checks ----
        _bountyExists(bountyId);
        Bounty storage b = bounties[bountyId];
        ClaimantInfo storage ci = claimants[bountyId][msg.sender];
        if (!ci.hasClaimed) revert NotClaimant();
        if (ci.hasSubmitted) revert AlreadySubmitted();

        if (b.claimMode == ClaimMode.FCFS) {
            if (b.status != BountyStatus.Claimed) revert BountyNotClaimed();
            if (b.currentClaimant != msg.sender) revert NotClaimant();
            if (block.timestamp > ci.claimDeadline) revert ClaimWindowExpired();
            // ---- Effects (FCFS) ----
            b.status = BountyStatus.Submitted;
        } else {
            if (b.status != BountyStatus.Open) revert BountyNotOpen();
            if (block.timestamp >= b.deadline) revert DeadlinePassed();
        }

        ci.hasSubmitted = true;
        ci.proofCID = proofCID;

        emit ProofSubmitted(bountyId, msg.sender, proofCID);
    }

    /**
     * @notice Approve a claimant. Allowed for the bounty's judge, and additionally
     *         for the contract owner when in `TrustedJudge` mode.
     */
    function approve(uint256 bountyId, address claimant) external nonReentrant {
        // ---- Checks ----
        _bountyExists(bountyId);
        Bounty storage b = bounties[bountyId];

        bool isJudge = (msg.sender == b.judge && b.judge != address(0));
        bool isOwnerOverride = (b.resolutionMode == ResolutionMode.TrustedJudge && msg.sender == owner());
        if (!isJudge && !isOwnerOverride) revert NotJudge();
        if (isOwnerOverride && claimant == msg.sender) revert JudgeIsClaimant();

        ClaimantInfo storage ci = claimants[bountyId][claimant];
        if (!ci.hasSubmitted) revert NotClaimant();
        if (b.status == BountyStatus.Resolved || b.status == BountyStatus.Cancelled || b.status == BountyStatus.Expired)
        {
            revert AlreadyResolved();
        }

        // ---- Effects ----
        ci.approved = true;
        ci.rejected = false;
        b.resolvedClaimant = claimant;
        // Anchor the challenge window from the moment of approval.
        b.finalizedAt = block.timestamp;

        emit Approved(bountyId, claimant, msg.sender);
    }

    /**
     * @notice Reject a claimant (judge only).
     */
    function reject(uint256 bountyId, address claimant) external nonReentrant {
        // ---- Checks ----
        _bountyExists(bountyId);
        Bounty storage b = bounties[bountyId];
        if (msg.sender != b.judge || b.judge == address(0)) revert NotJudge();
        ClaimantInfo storage ci = claimants[bountyId][claimant];
        if (!ci.hasSubmitted) revert NotClaimant();
        if (b.status == BountyStatus.Resolved || b.status == BountyStatus.Cancelled) revert AlreadyResolved();

        // ---- Effects ----
        ci.rejected = true;
        ci.approved = false;
        if (b.resolvedClaimant == claimant) {
            b.resolvedClaimant = address(0);
            b.finalizedAt = 0;
        }
        // For FCFS, drop the locked claimant so others can step up (status returns to Open).
        if (b.claimMode == ClaimMode.FCFS && b.currentClaimant == claimant) {
            b.currentClaimant = address(0);
            if (b.status == BountyStatus.Claimed || b.status == BountyStatus.Submitted) {
                b.status = BountyStatus.Open;
            }
        }

        emit Rejected(bountyId, claimant, msg.sender);
    }

    /**
     * @notice Pledger-weighted vote on a candidate for `PledgerVote` /
     *         `JudgeWithOverride` resolution modes. One vote per address per bounty.
     */
    function voteResolve(uint256 bountyId, address candidate, bool approve_) external nonReentrant {
        // ---- Checks ----
        _bountyExists(bountyId);
        Bounty storage b = bounties[bountyId];
        if (
            b.resolutionMode != ResolutionMode.PledgerVote
                && b.resolutionMode != ResolutionMode.JudgeWithOverride
        ) revert InvalidResolutionMode();

        if (b.status == BountyStatus.Resolved || b.status == BountyStatus.Cancelled) revert AlreadyResolved();

        uint256 weight = pledges[bountyId][msg.sender];
        if (weight == 0) revert NotPledger();
        if (hasVoted[bountyId][msg.sender]) revert AlreadyVoted();

        ClaimantInfo storage ci = claimants[bountyId][candidate];
        if (!ci.hasSubmitted) revert NotClaimant();

        // ---- Effects ----
        hasVoted[bountyId][msg.sender] = true;
        if (approve_) {
            voteWeights[bountyId][candidate] += weight;
        } else {
            rejectWeights[bountyId][candidate] += weight;
        }

        emit Voted(bountyId, msg.sender, candidate, approve_, weight);
    }

    /**
     * @notice Finalize a bounty and route the payout. Anyone may call once the
     *         resolution mode's preconditions are met.
     */
    function finalize(uint256 bountyId) external nonReentrant {
        // ---- Checks ----
        _bountyExists(bountyId);
        Bounty storage b = bounties[bountyId];
        if (b.status == BountyStatus.Resolved || b.status == BountyStatus.Cancelled) revert AlreadyResolved();

        address winner = _resolveWinner(b, bountyId);
        if (winner == address(0)) revert NoApprovedClaimant();

        uint256 pool = b.totalPledged;

        uint256 claimantAmount = (pool * b.claimantBps) / BPS_DENOMINATOR;
        uint256 treasuryAmount = (pool * b.treasuryBps) / BPS_DENOMINATOR;
        // Burn gets the remainder so rounding dust never gets stuck.
        uint256 burnAmount = pool - claimantAmount - treasuryAmount;

        // ---- Effects ----
        b.status = BountyStatus.Resolved;
        b.resolvedClaimant = winner;
        b.finalizedAt = block.timestamp;

        // ---- Interactions ----
        if (claimantAmount > 0) {
            CLAWD.safeTransfer(winner, claimantAmount);
        }
        if (treasuryAmount > 0) {
            CLAWD.safeTransfer(TREASURY, treasuryAmount);
        }
        if (burnAmount > 0) {
            CLAWD.safeTransfer(BURN_ADDRESS, burnAmount);
        }

        emit Finalized(bountyId, winner, claimantAmount, treasuryAmount, burnAmount);
    }

    /**
     * @notice Determine winner per resolution mode + check timing windows.
     */
    function _resolveWinner(Bounty storage b, uint256 bountyId) internal view returns (address winner) {
        if (b.resolutionMode == ResolutionMode.TrustedJudge) {
            // Judge (or owner override on approve) must have approved someone, and
            // the challenge window must have elapsed.
            address candidate = b.resolvedClaimant;
            if (candidate == address(0) || !claimants[bountyId][candidate].approved) return address(0);
            if (block.timestamp < b.finalizedAt + b.challengeWindow) revert ChallengeWindowNotOver();
            winner = candidate;
        } else if (b.resolutionMode == ResolutionMode.Optimistic) {
            // After bounty deadline, the most-recent submitter without rejection wins
            // if no challenge was raised. We require an approved claimant (judge or
            // owner) OR — if no judge — the resolvedClaimant set by approve still applies.
            if (block.timestamp < b.deadline) revert DeadlineNotPassed();
            address candidate = b.resolvedClaimant;
            if (candidate == address(0)) {
                // Fall back to the FCFS / first claimant if they submitted and weren't rejected.
                address[] storage list = _claimantList[bountyId];
                for (uint256 i = 0; i < list.length; i++) {
                    address c = list[i];
                    ClaimantInfo storage ci = claimants[bountyId][c];
                    if (ci.hasSubmitted && !ci.rejected) {
                        candidate = c;
                        break;
                    }
                }
            }
            if (candidate == address(0)) return address(0);
            if (block.timestamp < b.deadline + b.challengeWindow) revert ChallengeWindowNotOver();
            winner = candidate;
        } else if (b.resolutionMode == ResolutionMode.PledgerVote) {
            // Highest approval-weighted candidate (must clear pledgerOverrideBps of pool).
            if (block.timestamp < b.deadline) revert DeadlineNotPassed();
            uint256 threshold = (b.totalPledged * b.pledgerOverrideBps) / BPS_DENOMINATOR;
            address[] storage list = _claimantList[bountyId];
            uint256 bestWeight = 0;
            address best = address(0);
            for (uint256 i = 0; i < list.length; i++) {
                address c = list[i];
                if (!claimants[bountyId][c].hasSubmitted) continue;
                uint256 w = voteWeights[bountyId][c];
                if (w > bestWeight) {
                    bestWeight = w;
                    best = c;
                }
            }
            if (best == address(0) || bestWeight < threshold || threshold == 0) return address(0);
            winner = best;
        } else {
            // JudgeWithOverride: judge picks via approve(), but pledgers can override
            // by voting to reject the judge's pick. If reject weight >= threshold,
            // pick the highest-weighted alternative.
            address candidate = b.resolvedClaimant;
            if (candidate == address(0) || !claimants[bountyId][candidate].approved) return address(0);
            if (block.timestamp < b.finalizedAt + b.challengeWindow) revert ChallengeWindowNotOver();

            uint256 threshold = (b.totalPledged * b.pledgerOverrideBps) / BPS_DENOMINATOR;
            uint256 rejectW = rejectWeights[bountyId][candidate];
            if (threshold > 0 && rejectW >= threshold) {
                // Override the judge: pick the most-approved alternative.
                address[] storage list = _claimantList[bountyId];
                uint256 bestWeight = 0;
                address best = address(0);
                for (uint256 i = 0; i < list.length; i++) {
                    address c = list[i];
                    if (c == candidate) continue;
                    if (!claimants[bountyId][c].hasSubmitted) continue;
                    uint256 w = voteWeights[bountyId][c];
                    if (w > bestWeight) {
                        bestWeight = w;
                        best = c;
                    }
                }
                if (best == address(0)) return address(0);
                winner = best;
            } else {
                winner = candidate;
            }
        }
    }

    /**
     * @notice Pull back an unused pledge.
     */
    function refund(uint256 bountyId) external nonReentrant {
        // ---- Checks ----
        _bountyExists(bountyId);
        Bounty storage b = bounties[bountyId];
        uint256 amount = pledges[bountyId][msg.sender];
        if (amount == 0) revert NotPledger();

        bool resolvedTerminal =
            b.status == BountyStatus.Resolved || b.status == BountyStatus.Submitted || b.status == BountyStatus.Claimed;

        bool refundOk;
        if (b.status == BountyStatus.Cancelled || b.status == BountyStatus.Expired) {
            // Cancelled / expired bounties are always refundable regardless of policy.
            refundOk = true;
        } else if (b.refundPolicy == RefundPolicy.Sticky) {
            refundOk = false;
        } else if (resolvedTerminal) {
            refundOk = false;
        } else if (b.refundPolicy == RefundPolicy.Refundable) {
            // Refundable: allowed any time pre-claim, or after refundUnlockTime.
            refundOk = (b.status == BountyStatus.Open) && block.timestamp >= b.refundUnlockTime;
        } else {
            // Hybrid: only after refundUnlockTime AND not in claimed/submitted/resolved.
            refundOk = (b.status == BountyStatus.Open) && block.timestamp >= b.refundUnlockTime;
        }

        if (!refundOk) revert RefundNotAvailable();

        // ---- Effects ----
        pledges[bountyId][msg.sender] = 0;
        b.totalPledged -= amount;

        // ---- Interactions ----
        CLAWD.safeTransfer(msg.sender, amount);

        emit Refunded(bountyId, msg.sender, amount);
    }

    /**
     * @notice Cancel a bounty before any claim has been made.
     *         Pledgers must call `refund()` themselves to retrieve their funds.
     */
    function cancelBounty(uint256 bountyId) external nonReentrant {
        // ---- Checks ----
        _bountyExists(bountyId);
        Bounty storage b = bounties[bountyId];
        if (msg.sender != b.creator) revert NotCreator();
        if (b.status != BountyStatus.Open) revert BountyNotOpen();
        if (b.currentClaimant != address(0)) revert AlreadyClaimed();

        // ---- Effects ----
        b.status = BountyStatus.Cancelled;

        emit Cancelled(bountyId);
    }

    // -----------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------

    /// @notice Number of distinct claimants registered for a bounty.
    function claimantCount(uint256 bountyId) external view returns (uint256) {
        return _claimantList[bountyId].length;
    }

    /// @notice Get a claimant address at index `i` for a bounty.
    function claimantAt(uint256 bountyId, uint256 i) external view returns (address) {
        return _claimantList[bountyId][i];
    }

    /// @notice Full claimant info struct getter.
    function getClaimantInfo(uint256 bountyId, address claimant) external view returns (ClaimantInfo memory) {
        return claimants[bountyId][claimant];
    }
}
