// PaymentGatewayService - Service kết nối cổng thanh toán online VNPay thực tế
// Sử dụng thư viện 'vnpay' (npm i vnpay) để tích hợp với VNPay gateway
// Hỗ trợ:
// - Thanh toán QR / Internet Banking / Credit Card qua VNPay
// - Verify IPN (Instant Payment Notification) từ VNPay
// - Verify Return URL sau khi user thanh toán xong

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VNPay, ProductCode, VnpLocale } from 'vnpay';

// Kết quả khi khởi tạo thanh toán QR (VNPay hỗ trợ QR)
export interface QrPaymentResult {
  provider: string; // Tên provider: 'vnpay'
  transactionId: string; // Mã giao dịch do VNPay trả về (vnp_TxnRef)
  qrUrl?: string; // URL ảnh QR (nếu VNPay trả về)
  checkoutUrl: string; // URL thanh toán VNPay (user redirect tới đây)
}

// Kết quả khi khởi tạo thanh toán Credit Card (qua VNPay)
export interface CardPaymentResult {
  provider: string; // Tên provider: 'vnpay'
  transactionId: string; // Mã giao dịch do VNPay trả về (vnp_TxnRef)
  checkoutUrl: string; // URL trang thanh toán VNPay để redirect
}

@Injectable()
export class PaymentGatewayService {
  private vnpay: VNPay;

  constructor(private configService: ConfigService) {
    // Khởi tạo VNPay instance với config từ .env
    // Lấy các thông tin từ ConfigService (đã load từ .env)
    const tmnCode = this.configService.get<string>('VNP_TMN_CODE');
    const secureSecret = this.configService.get<string>('VNP_HASH_SECRET');
    const vnpUrl = this.configService.get<string>('VNP_URL');

    // Validate: nếu thiếu config thì throw error
    if (!tmnCode || !secureSecret || !vnpUrl) {
      throw new Error(
        'VNPay config missing. Please set VNP_TMN_CODE, VNP_HASH_SECRET, VNP_URL in .env',
      );
    }

    // Tạo instance VNPay với config
    // VNPay SDK yêu cầu vnpayHost thay vì vnpUrl
    this.vnpay = new VNPay({
      tmnCode, // Mã website/merchant từ VNPay
      secureSecret, // Chuỗi bí mật để tạo/verify chữ ký
      vnpayHost: vnpUrl, // URL VNPay (sandbox hoặc production) - dùng vnpayHost thay vì vnpUrl
    });
  }

  /**
   * Khởi tạo thanh toán QR qua VNPay
   * VNPay hỗ trợ thanh toán QR code, user quét QR để thanh toán
   * Thực tế: VNPay trả về URL thanh toán, user mở URL này để quét QR hoặc chọn phương thức thanh toán
   * Lưu ý: buildPaymentUrl() là synchronous, nhưng ta wrap trong async để nhất quán và dễ mở rộng sau này
   */
  async initiateQrPayment(
    amount: number, // Số tiền (VND)
    currency: string, // Đơn vị tiền tệ (VND)
    orderCode: string, // Mã đơn hàng (vnp_TxnRef) - phải unique
    ipAddr: string, // IP của user (lấy từ request)
    returnUrl: string, // URL FE nhận kết quả sau khi thanh toán (return URL)
  ): Promise<QrPaymentResult> {
    // Tạo URL thanh toán VNPay bằng buildPaymentUrl
    // VNPay sẽ tự động tạo chữ ký (vnp_SecureHash) và trả về URL đầy đủ
    // buildPaymentUrl() là synchronous, nhưng ta wrap trong Promise để có thể dùng await
    const paymentUrl = await Promise.resolve(
      this.vnpay.buildPaymentUrl({
        vnp_Amount: amount, // Số tiền (VND) - VNPay yêu cầu nhân 100, nhưng SDK tự xử lý
        vnp_IpAddr: ipAddr, // IP của user
        vnp_TxnRef: orderCode, // Mã đơn hàng (phải unique, dùng để map với payment trong DB)
        vnp_OrderInfo: `Thanh toán vé xem phim - ${orderCode}`, // Mô tả đơn hàng
        vnp_OrderType: ProductCode.Other, // Loại sản phẩm (Other = khác)
        vnp_ReturnUrl: returnUrl, // URL FE nhận kết quả (sau khi user thanh toán xong, VNPay redirect về đây)
        vnp_Locale: VnpLocale.VN, // Ngôn ngữ hiển thị (VN = tiếng Việt, EN = tiếng Anh)
      }),
    );

    // VNPay không trả về transactionId riêng, ta dùng orderCode làm transactionId
    // (vì orderCode là unique và được VNPay trả về trong IPN/Return URL)
    return {
      provider: 'vnpay',
      transactionId: orderCode, // Dùng orderCode làm transactionId
      checkoutUrl: paymentUrl, // URL thanh toán VNPay (user redirect tới đây)
    };
  }

  /**
   * Khởi tạo thanh toán Credit Card qua VNPay
   * VNPay hỗ trợ thanh toán thẻ quốc tế (Visa, Mastercard) và thẻ nội địa
   * Thực tế: VNPay trả về URL thanh toán, user redirect tới URL này để nhập thẻ
   * Lưu ý: buildPaymentUrl() là synchronous, nhưng ta wrap trong async để nhất quán và dễ mở rộng sau này
   */
  async initiateCardPayment(
    amount: number, // Số tiền (VND)
    currency: string, // Đơn vị tiền tệ (VND)
    orderCode: string, // Mã đơn hàng (vnp_TxnRef) - phải unique
    ipAddr: string, // IP của user (lấy từ request)
    returnUrl: string, // URL FE nhận kết quả sau khi thanh toán (return URL)
  ): Promise<CardPaymentResult> {
    // Tạo URL thanh toán VNPay (giống QR, nhưng user sẽ chọn phương thức thẻ)
    // buildPaymentUrl() là synchronous, nhưng ta wrap trong Promise để có thể dùng await
    const paymentUrl = await Promise.resolve(
      this.vnpay.buildPaymentUrl({
        vnp_Amount: amount,
        vnp_IpAddr: ipAddr,
        vnp_TxnRef: orderCode,
        vnp_OrderInfo: `Thanh toán vé xem phim - ${orderCode}`,
        vnp_OrderType: ProductCode.Other,
        vnp_ReturnUrl: returnUrl,
        vnp_Locale: VnpLocale.VN,
      }),
    );

    return {
      provider: 'vnpay',
      transactionId: orderCode, // Dùng orderCode làm transactionId
      checkoutUrl: paymentUrl, // URL thanh toán VNPay (user redirect tới đây)
    };
  }

  /**
   * Verify IPN (Instant Payment Notification) từ VNPay
   * VNPay sẽ gọi endpoint này (webhook) sau khi user thanh toán xong
   * Đây là nơi xử lý business logic (tạo ticket, update seatStates, ...)
   * @param queryParams - Query params từ VNPay IPN request
   * @returns VerifyIpnCall object chứa thông tin verify và payment status
   */
  verifyIpnCall(queryParams: Record<string, string>) {
    // VNPay SDK tự động verify chữ ký (vnp_SecureHash) và trả về kết quả
    // Cast queryParams về type mà VNPay SDK yêu cầu
    const verify = this.vnpay.verifyIpnCall(queryParams as any);

    // verify.isVerified: true nếu chữ ký hợp lệ (đảm bảo dữ liệu không bị giả mạo)
    // verify.isSuccess: true nếu thanh toán thành công (vnp_ResponseCode === '00')
    // verify.vnp_Amount: số tiền (đã tự động chia 100)
    // verify.vnp_TxnRef: mã đơn hàng (orderCode)
    // verify.vnp_ResponseCode: mã phản hồi ('00' = thành công, khác = thất bại)

    return verify;
  }

  /**
   * Verify Return URL từ VNPay
   * Sau khi user thanh toán xong, VNPay redirect user về returnUrl với query params
   * FE sẽ nhận query params này và gọi API để verify
   * Lưu ý: Chỉ dùng để hiển thị UI, business logic phải xử lý ở IPN
   * @param queryParams - Query params từ VNPay return URL
   * @returns VerifyReturnUrl object chứa thông tin verify và payment status
   */
  verifyReturnUrl(queryParams: Record<string, string>) {
    // VNPay SDK tự động verify chữ ký và trả về kết quả
    // Cast queryParams về type mà VNPay SDK yêu cầu
    const verify = this.vnpay.verifyReturnUrl(queryParams as any);

    // verify.isVerified: true nếu chữ ký hợp lệ
    // verify.isSuccess: true nếu thanh toán thành công
    // verify.vnp_TxnRef: mã đơn hàng (orderCode)

    return verify;
  }
}
