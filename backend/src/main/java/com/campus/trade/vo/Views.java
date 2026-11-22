package com.campus.trade.vo;

import com.campus.trade.constant.CertStatus;
import com.campus.trade.entity.Admin;
import com.campus.trade.entity.Student;

import java.time.LocalDateTime;

/**
 * 对外视图：严格白名单，手机号 / 宿舍地址 / 真实姓名 / 学号 只出现在本人或管理员视图（§6.5）。
 */
public final class Views {

    /** 他人可见的学生信息（公开主页、商品发布人） */
    public record PublicStudentVo(
            Long id,
            String nickname,
            String certStatus,
            boolean certified,
            String accountStatus,
            boolean banned,
            Integer creditScore,
            Integer reviewCount,
            Integer verifiedDisputeCount,
            LocalDateTime registeredAt
    ) {
        public static PublicStudentVo of(Student s) {
            if (s == null) {
                return null;
            }
            return new PublicStudentVo(s.getId(), s.getNickname(), s.getCertStatus(),
                    CertStatus.CERTIFIED.equals(s.getCertStatus()), s.getAccountStatus(),
                    "封禁".equals(s.getAccountStatus()), s.getCreditScore(), s.getReviewCount(),
                    s.getVerifiedDisputeCount(), s.getRegisteredAt());
        }
    }

    /** 本人可见的学生信息 */
    public record SelfStudentVo(
            Long id,
            String email,
            String studentNo,
            String nickname,
            String realName,
            String phone,
            String dorm,
            String certStatus,
            String accountStatus,
            Integer creditScore,
            Integer reviewCount,
            Integer verifiedDisputeCount,
            Integer resubmitCount,
            LocalDateTime registeredAt
    ) {
        public static SelfStudentVo of(Student s) {
            if (s == null) {
                return null;
            }
            return new SelfStudentVo(s.getId(), s.getEmail(), s.getStudentNo(), s.getNickname(),
                    s.getRealName(), s.getPhone(), s.getDorm(), s.getCertStatus(), s.getAccountStatus(),
                    s.getCreditScore(), s.getReviewCount(), s.getVerifiedDisputeCount(),
                    s.getResubmitCount(), s.getRegisteredAt());
        }
    }

    public record AdminVo(Long id, String adminNo, String displayName, boolean mustChangePassword) {
        public static AdminVo of(Admin a) {
            if (a == null) {
                return null;
            }
            return new AdminVo(a.getId(), a.getAdminNo(), a.getDisplayName(),
                    a.getMustChangePassword() != null && a.getMustChangePassword() == 1);
        }
    }

    public record CategoryVo(Long id, String name, Integer sort, long onSaleCount) {
    }

    public record LoginResult(String token, SelfStudentVo student, String restrictedNotice) {
    }

    public record AdminLoginResult(String token, AdminVo admin) {
    }

    /** 学生本人可见的核验申请 */
    public record CertApplicationVo(
            Long id,
            String declaredNo,
            String reviewStatus,
            String rejectReason,
            boolean forgeryFlag,
            LocalDateTime submittedAt,
            LocalDateTime reviewedAt
    ) {
        public static CertApplicationVo of(com.campus.trade.entity.CertificationApplication a) {
            if (a == null) {
                return null;
            }
            return new CertApplicationVo(a.getId(), a.getDeclaredNo(), a.getReviewStatus(), a.getRejectReason(),
                    a.getForgeryFlag() != null && a.getForgeryFlag() == 1, a.getSubmittedAt(), a.getReviewedAt());
        }
    }

    /** 管理员审核队列条目（含学生信息） */
    public record AdminCertApplicationVo(
            Long id,
            Long studentId,
            String nickname,
            String realName,
            String email,
            String declaredNo,
            Integer resubmitCount,
            String reviewStatus,
            String rejectReason,
            boolean forgeryFlag,
            LocalDateTime submittedAt,
            LocalDateTime reviewedAt
    ) {
    }

    public record CertStateVo(
            String certStatus,
            Integer resubmitCount,
            Integer resubmitLimit,
            boolean canSubmit,
            String studentNo,
            CertApplicationVo latest
    ) {
    }

    /** 商品视图（列表与详情共用；管理员视图额外带审核信息） */
    public record ProductVo(
            Long id,
            String title,
            String description,
            String price,
            Integer priceCents,
            String condition,
            String status,
            String offShelfReason,
            String reviewNote,
            Long categoryId,
            String categoryName,
            Long sellerId,
            PublicStudentVo seller,
            java.util.List<String> images,
            LocalDateTime publishedAt,
            LocalDateTime reviewedAt,
            Integer viewCount,
            Long favoriteCount,
            Boolean favorited,
            Boolean owner,
            Boolean canEdit,
            Boolean canWithdraw,
            Boolean canTakeDown,
            Boolean canDelete,
            Boolean canResubmit
    ) {
    }

    public record MyProductsVo(long total, java.util.Map<String, java.util.List<ProductVo>> groups) {
    }

    /** 订单（成交记录）视图：本版没有订单状态机，只有两个标记（SRS §7.1） */
    public record OrderVo(
            Long id,
            Long productId,
            String productTitle,
            String productStatus,
            String amount,
            String status,
            LocalDateTime createdAt,
            LocalDateTime deliveryDeadline,
            Long buyerId,
            Long sellerId,
            PublicStudentVo buyer,
            PublicStudentVo seller,
            String myRole,
            Long peerId,
            String peerNickname,
            Long cancelInitiatorId,
            String cancelReason,
            LocalDateTime cancelledAt,
            String cancelJudgement,
            LocalDateTime judgementAt,
            Boolean canReview,
            Boolean canCancel,
            Boolean canJudge,
            LocalDateTime reviewDeadline,
            LocalDateTime judgeDeadline,
            String judgeRemaining,
            Boolean myReviewed,
            Boolean peerReviewed
    ) {
    }

    public record ReviewVo(
            Long id,
            Long orderId,
            Long reviewerId,
            String reviewerNickname,
            Long targetId,
            String content,
            LocalDateTime createdAt
    ) {
    }

    public record FavoriteItemVo(
            Long productId,
            String title,
            String price,
            String condition,
            String status,
            boolean invalid,
            String invalidLabel,
            String cover,
            LocalDateTime favoritedAt
    ) {
    }

    public record CreditRecordVo(
            Long id,
            Integer delta,
            String eventType,
            String reason,
            Long orderId,
            LocalDateTime createdAt
    ) {
    }

    public record CreditVo(
            Integer score,
            Integer min,
            Integer max,
            Integer initial,
            Integer publishThreshold,
            Integer orderThreshold,
            Boolean canPublish,
            Boolean canOrder,
            java.util.List<CreditRecordVo> records,
            String hint
    ) {
    }

    public record ReportVo(
            Long id,
            Long reporterId,
            String reporterNickname,
            String targetType,
            Long targetProductId,
            String targetProductTitle,
            String targetProductStatus,
            Long targetStudentId,
            String targetStudentNickname,
            String type,
            String reason,
            String handleStatus,
            java.util.List<String> actions,
            String violationCodes,
            String result,
            Long handlerAdminId,
            LocalDateTime handledAt,
            LocalDateTime createdAt,
            java.util.List<String> allowedActions
    ) {
    }

    public record MessageVo(
            Long id,
            Long productId,
            String senderType,
            Long senderId,
            String receiverType,
            Long receiverId,
            String content,
            Boolean read,
            Boolean mine,
            LocalDateTime createdAt
    ) {
    }

    public record ConversationVo(
            Long productId,
            String productTitle,
            String productStatus,
            Long peerId,
            String peerNickname,
            boolean peerBanned,
            int unread,
            int messageCount,
            String lastContent,
            LocalDateTime lastAt,
            boolean lastFromMe
    ) {
    }

    public record ConversationDetailVo(
            Long productId,
            String productTitle,
            String productStatus,
            String offShelfReason,
            Long peerId,
            String peerNickname,
            boolean peerBanned,
            boolean iAmSeller,
            java.util.List<MessageVo> messages
    ) {
    }

    public record NotificationVo(
            Long id,
            String msgType,
            String title,
            String content,
            String relatedKind,
            Long relatedId,
            Long productId,
            Long peerId,
            Boolean read,
            LocalDateTime createdAt
    ) {
    }

    public record ProfileVo(
            PublicStudentVo student,
            String certLabel,
            boolean banned,
            long inSaleCount,
            java.util.List<ProductVo> inSaleProducts,
            java.util.List<ReviewVo> reviews,
            boolean self,
            java.util.Map<String, Object> selfExtra,
            java.util.Map<String, Object> adminExtra
    ) {
    }

    private Views() {
    }
}
