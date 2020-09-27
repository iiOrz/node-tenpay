'use strict';

module.exports = app => {
  const dbBook = app.dbManager.database('book');
  class Service extends app.Service {

    async Start({userID,appID,couponID,vn,toVn,returnUrl,agentCode,type,equipment,buyChannel,sandbox,openID,ip,branchBookList,couponUserID}){
      //获取基础信息
      let baseInfo = await this.GetBaseInfo(userID, appID, couponID, vn,toVn, returnUrl, agentCode, type, equipment, buyChannel, sandbox,branchBookList,ip,openID,couponUserID)
      //console.log(baseInfo.branchBookList)
      //验证基础信息
      await this.CheckBasicInfo(baseInfo)
      //验证年卡、考季卡
      await this.CheckKJK(baseInfo)
      //获取价格信息
      let priceInfo = baseInfo.toPriceInfo
      //原价
      let originalPrice = priceInfo.price
      //最终付款价格
      let totalPrice = 99999
      //判断是否单科补差价
      if(baseInfo.branchBookList){
        //获取单科总额
        originalPrice = await this.GetBookPrice(baseInfo.branchBookList,priceInfo)
        //console.log(originalPrice)
      }
      //计算价格
      originalPrice = Math.floor((parseInt(originalPrice)-parseInt(baseInfo.priceInfo.price))*100*parseFloat(priceInfo.discount||1))/100;
      totalPrice = originalPrice
      //高级职称系列补差价特殊规则
      if((await this.ctx.service.price.tsrule(baseInfo.appInfo.appID,baseInfo.toVnInfo.vn)) === true){
        //补差价价格等于原价
        totalPrice = Math.floor((parseInt(priceInfo.price))*100*parseFloat(priceInfo.discount||1))/100;
      }
      //判断是否优惠券
      if(couponID||couponUserID){
        //优惠券流程
        //let offPrice = await this.GetCouponPrice(baseInfo,originalPrice)
        //totalPrice = originalPrice - offPrice
        //验证优惠券
        await this.ctx.service.process.kspay.checkPriceInfo(baseInfo)
        //获取减免金额
        let baseInfo_other = baseInfo
        baseInfo_other.priceInfo.price = originalPrice
        let offPrice = await this.ctx.service.process.kspay.getoffprice(baseInfo_other)
        totalPrice = originalPrice - offPrice
      }
      //获取微信或支付宝信息
      let payInfo = await this.GetPayType(baseInfo)
      //生成订单信息
      let orderInfo = await this.GetOrderInfo(baseInfo,originalPrice,totalPrice,payInfo)
      //生成支付连接
      let url = await this.GetPayUrl(baseInfo,payInfo,orderInfo)
      let returnInfo = {
        orderID: orderInfo.orderID, //生成的订单号
        userName: baseInfo.userInfo.userName, //用户名
        softName:  baseInfo.appInfo.appName, //科目名称
        price: orderInfo.price, //价格
        days: orderInfo.days, //时长
        alipay: null, //支付宝支付链接
        wxUrl: null, //微信二维码url
        prepay_id: null, //预支付ID（APP封壳支付需要）
      }
      return Object.assign({},returnInfo,url)
    }

    //获取基础信息
    async GetBaseInfo(userID,appID,couponID, vn,toVn, returnUrl, agentCode, type, equipment, buyChannel,sandbox,branchBookList,ip,openid,couponUserID){
      let self = this;
      let baseInfo = {equipment,buyChannel,sandbox,branchBookList,returnUrl,type,ip,vn,toVn}
      //启动事务
      await self.ctx.service.process.service.useTransaction(await async function (t) {
        //获取用户信息
        baseInfo.userInfo = await self.ctx.service.process.service.getUserInfo(['userID', 'userName'], {userID}, t)
        //获取科目信息
        baseInfo.appInfo = await self.ctx.service.process.service.getAppInfo(['appID', 'appEName', 'appName', 'CName'], {appID}, t)
        //获取用户优惠券信息
        //baseInfo.couponUserInfo = couponID ? await self.ctx.service.process.service.getCouponUserInfo(['couponUserID', 'endTime', 'status','discount'], {
        //    userID,
        //    couponID
        //}, t) : false
        //获取用户优惠券信息
        baseInfo.couponUserInfo = couponUserID ? await self.ctx.service.process.service.getCouponUserListInfo(['couponUserID','couponID', 'endTime','offPrice', 'status','discount'], {
          userID,
          $or:[{couponUserID},{ID:couponUserID}]
        }, t) : false
        baseInfo.couponManageInfo = baseInfo.couponUserInfo?await self.ctx.service.process.service.getSimpleInfo('couponmanage',{couponID:baseInfo.couponUserInfo.map(t=>t.couponID)},['couponID','name','couponLimitJson','groupid','closeTime'],'findAll',t):false
        //获取优惠券信息
        baseInfo.couponInfo = couponID ? await self.ctx.service.process.service.getCouponInfo(['couponJson','couponLimitJson'], {couponID}, t) : false
        //获取班次信息
        baseInfo.vnInfo = await self.ctx.service.process.service.getVnInfo(['vn', 'vname'], {vn:vn}, t)

        baseInfo.toVnInfo = await self.ctx.service.process.service.getVnInfo(['vn', 'vname'], {vn:toVn}, t)
        //获取价格信息
        baseInfo.priceInfo = await self.ctx.service.process.service.getPriceInfo(['price', 'discount', 'appClassID','subCount','subPrice','subJson','days'], {
          appID: baseInfo.appInfo.appID,
          vn
        },t)
        //获取升级班次信息
        baseInfo.toPriceInfo = await self.ctx.service.process.service.getPriceInfo(['price', 'discount', 'appClassID','subCount','subPrice','subJson','subAppClassID','days'], {
          appID: baseInfo.appInfo.appID,
          vn:toVn
        },t)
        //获取代理商信息
        baseInfo.agentInfo = await self.ctx.service.process.service.getAgentInfo(['agentCode','enable','isWeixinPay','weixinPay','phonePayUrl','pcPayUrl','weixinPayUrl',"payJson",'alipay','newSmp'],{agentCode},t)
        //获取代理商支付配置
        baseInfo.alipayPayInfo = await self.ctx.service.process.service.getAgentInfoByAlipay(['enabled', 'Keys', 'WapKey', 'PID', 'Agent_ID', 'Alipay_NO','enable','AppID','PrivateKey','PublicKey','AlipayPublick'], {agent_id: agentCode},t)
        //获取代理商微信配置
        baseInfo.weixinPayInfo = await self.ctx.service.process.service.getAgentInfoByWechat(['enabled', 'key', 'appID', 'partner','enable','isOfficial'], {agentCode},t)
        //官方的
        baseInfo.mainAlipayPayInfo = await self.ctx.service.process.service.getAgentInfoByAlipay(['enabled', 'Keys', 'WapKey', 'PID', 'Agent_ID', 'Alipay_NO','enable'], {agent_id: 888},t)
        //获取代理商微信配置
        baseInfo.mainWeixinPayInfo = await self.ctx.service.process.service.getAgentInfoByWechat(['enabled', 'key', 'appID', 'partner'], {agentCode:888},t)
        baseInfo.appWeixinPayInfo = baseInfo.mainWeixinPayInfo;
        //获取已开通科目
        baseInfo.vipInfo = await self.ctx.service.process.service.getVipInfo(['endTime','isLock','beginTime','clientType','orderID','vipID'],{vn,appID:baseInfo.appInfo.appID,userID},t)
        //获取补差价升级设置
        baseInfo.vnupgradeInfo = await self.ctx.service.process.service.getSimpleInfo('vnupgrade',{AppID:appID,OldVn:vn,NewVn:toVn},['ID','Discount'],'findOne');
      })
      return baseInfo;
    }
    //验证基础信息
    async CheckBasicInfo(baseInfo){
      if(!baseInfo.userInfo){
        throw new Error('该用户不存在')
      }
      if(!baseInfo.appInfo){
        throw new Error('该科目不存在')
      }
      if (baseInfo.couponUserInfo && baseInfo.couponUserInfo.status && baseInfo.couponUserInfo.status !== 0) {
        throw new Error('该优惠卷已使用')
      }
      if (baseInfo.couponUserInfo && baseInfo.couponUserInfo.endTime > new Date().toString()) {
        throw new Error('该优惠券已过期')
      }
      //if (!baseInfo.couponInfo && baseInfo.couponInfo !== false) {
      //    throw new Error('该优惠券不存在')
      //}
      if ((!baseInfo.couponInfo && baseInfo.couponInfo !== false)||(!baseInfo.couponManageInfo && baseInfo.couponManageInfo !== false)) {
        throw new Error('优惠券不存在');
      }
      if(baseInfo.couponManageInfo && baseInfo.couponManageInfo.length>0 &&baseInfo.couponUserInfo.length>1){
        throw new Error('该优惠券不能叠加使用');
      }
      if(baseInfo.couponManageInfo && baseInfo.couponManageInfo.length===1){
        if(baseInfo.couponManageInfo[0].closeTime&&new Date(baseInfo.couponManageInfo[0].closeTime)<new Date()){
          throw new Error('该活动已关闭');
        }
      }
      if (!baseInfo.vnInfo) {
        throw new Error('该班次不存在')
      }
      if (!baseInfo.toVnInfo) {
        throw new Error('该班次不存在')
      }
      if (!baseInfo.agentInfo) {
        throw new Error('该代理商不存在')
      }
      if (!baseInfo.toPriceInfo) {
        throw new Error('该代理商暂时无法支付')
      }
      if (baseInfo.agentInfo.enable===0) {
        throw new Error('该代理商不存在')
      }
      if(!baseInfo.alipayPayInfo&&!baseInfo.mainAlipayPayInfo){
        throw new Error('该代理商暂时无法支付')
      }
      if(baseInfo.alipayPayInfo&&baseInfo.alipayPayInfo.enable===0){
        throw new Error('该代理商不支持支付')
      }
      if(!baseInfo.weixinPayInfo&&!baseInfo.mainWeixinPayInfo){
        throw new Error('该代理商暂时无法支付')
      }
      if(baseInfo.weixinPayInfo&&baseInfo.weixinPayInfo.enable===0){
        throw new Error('该代理商不支持支付')
      }
      if(baseInfo.agentInfo.weixinPay===1&&!baseInfo.weixinPayInfo){
        throw new Error('该代理商暂时无法支付')
      }
      if(baseInfo.agentInfo.weixinPay===0&&!baseInfo.mainWeixinPayInfo){
        throw new Error('该代理商暂时无法支付')
      }
      if(!baseInfo.agentInfo.payJson){
        throw new Error('该代理商暂时不支持支付')
      }
      if(JSON.parse(baseInfo.agentInfo.payJson)[baseInfo.type]!==true&&JSON.parse(baseInfo.agentInfo.payJson)[baseInfo.type]!=='true'){
        throw new Error('代理商暂时不支持该支付方式')
      }
      if(!baseInfo.priceInfo.subCount>1){
        throw new Error('选中的课程不支持单科目购买')
      }
      if(!baseInfo.vipInfo){
        throw new Error('该版本用户未购买')
      }
      if(!baseInfo.vnupgradeInfo){
        throw new Error('该班次暂不支持升级到该班次')
      }
      //验证选中书籍181214
      if(baseInfo.branchBookList){
        try{
          let bookList = JSON.parse(baseInfo.branchBookList);
          let subJson = JSON.parse(baseInfo.toPriceInfo.subJson);
          let bookResult = 0;
          for(let i = 0;i<bookList.length;i++){
            for(let j = 0;j<subJson.length;j++){
              if(bookList[i]==subJson[j]){
                delete subJson[j]
                bookResult++;
              }
            }
          }
          if(bookResult!==bookList.length){
            throw new Error('选中的课程不一致')
          }
          //if(bookResult===baseJson.subCount){
          //    baseJson.branchBookList = null
          //}
        }
        catch(ex){
          //console.log(ex.message)
          throw new Error('选中的课程有误')
        }
      }
    }
    //获取单科目购买总价格
    async GetBookPrice(branchBookList,priceInfo){
      let subPrice = priceInfo.subPrice;
      let subCount = priceInfo.subCount;
      let bookCount = JSON.parse(branchBookList).length;
      if(subPrice && subCount > 0){
        if(subCount>bookCount){
          //获得价格(单本课本价格 * 数量)
          let bookPrice = parseFloat(subPrice) * parseFloat(bookCount)
          //let totalPrice = (parseFloat(bookPrice) - parseFloat(offprice || 0)) * parseFloat(priceInfo.discount || 1)
          //userOrderType = 'privatesubject';
          return bookPrice
        }else if(subCount===bookCount){
          //获得全价 totalPrice 不变
          //userOrderType = 'privatesubject';
          return priceInfo.price
        }else {
          throw new Error('选中的课程不一致')
        }
      }else {
        throw new Error('未添加该课程')
      }
    }
    //获取优惠券减免价格
    async GetCouponPrice(baseInfo,price){
      let couponJson = JSON.parse(baseInfo.couponInfo.couponLimitJson)
      let offprice = couponJson.offprice
      let limitprice = couponJson.limitprice
      let appENameList = couponJson.appEName
      let agentCode = couponJson.agentCode
      let vn = couponJson.vn
      if (limitprice && parseFloat(limitprice) > parseFloat(price)) {
        throw new Error('该价格不适合使用此优惠券')
      }
      if (appENameList) {
        let j = false
        for (let i of appENameList) {
          if (baseInfo.appInfo.appEName === i) {
            j = true
            break
          }
        }
        if (j === false) {
          throw new Error('该优惠券的使用科目不正确')
        }
      }
      if (agentCode) {
        let l = false
        for (let n of agentCode) {
          if (baseInfo.agentInfo.agentCode === n) {
            l = true
            break
          }
        }
        if (l === false) {
          throw new Error('该优惠券的只能在指定的代理商使用')
        }
      }
      if(vn){
        let m = false
        for(let r of vn){
          if(baseInfo.toVnInfo.vn.toString() === r.toString()){
            m = true
            break
          }
        }
        if(m === false){
          throw new Error('该优惠券的只能在指定的班次使用')
        }
      }
      return offprice||0
    }
    //生成订单信息
    async GetOrderInfo(baseInfo,originalPrice,totalPrice,payInfo){
      let orderParams = {
        userID:baseInfo.userInfo.userID, //用户ID
        appID:baseInfo.appInfo.appID, //软件ID
        orderID:this.ctx.service.order.newOrderID(baseInfo.userInfo.userID), //订单号,我们自己生成
        payType:baseInfo.type, //支付类型
        agentCode:baseInfo.agentInfo.agentCode, //代理商编号
        appClassID:baseInfo.toPriceInfo.appClassID, //软件系列ID
        price:totalPrice, //价格
        originalPrice:originalPrice,
        equipment:baseInfo.equipment, //下单设备类型
        buyChannel:baseInfo.buyChannel, //购买渠道，区别同一个产品在不同渠道的购买情况
        vn:baseInfo.vnInfo.vn,
        userOrderType:'spread', //补差价类型
        //couponUserID:baseInfo.couponUserInfo.couponUserID,
        subJson:baseInfo.branchBookList|| JSON.stringify(await this.getBookExtend(baseInfo.toPriceInfo.subJson)),
        user_ip: baseInfo.ip,
        seller_id:payInfo.seller_id,
        effectType:baseInfo.toVnInfo.vn,
        days:baseInfo.toPriceInfo.days,
        workSystemType:1,//补差价标记
        directPay:baseInfo.agentInfo.newSmp
      }
      if(orderParams.subJson==='[null]' || orderParams.subJson==='null'||orderParams.subJson===null){
        orderParams.appClassID = baseInfo.toPriceInfo.appClassID;
      }
      //单个优惠券
      if(typeof baseInfo.couponUserInfo==='number'){
        orderParams.couponUserID = baseInfo.couponUserInfo.couponUserID
      }
      //多个优惠券叠加
      if(typeof baseInfo.couponUserInfo==='object'){
        orderParams.couponUserID = JSON.stringify(baseInfo.couponUserInfo.map(t=>t.couponUserID))
      }
      //启动事务
      let self = this;
      await self.ctx.service.process.service.useTransaction(await async function (t) {
        //创建订单
        await self.ctx.service.process.service.addOrder(orderParams,t)
      })
      return orderParams
    }
    //获得支付类型和收款账户信息
    async GetPayType(baseInfo){
      let payInfo;
      switch (baseInfo.type){
        case 'alipay': //支付宝支付(手机)
        case 'alipay_web': //支付宝支付(网页)
          console.log(baseInfo.agentInfo.alipay)
          if(baseInfo.agentInfo.alipay==-1){
            payInfo = baseInfo.mainAlipayPayInfo
            payInfo.seller_id = baseInfo.mainAlipayPayInfo.PID
          }else{
            payInfo = baseInfo.alipayPayInfo
            payInfo.seller_id = baseInfo.alipayPayInfo.PID
          }

          break
        case 'alipay_app':
          payInfo = baseInfo.alipayPayInfo
          payInfo.seller_id = baseInfo.alipayPayInfo.PID
          break
        case 'weixin': //微信支付（原生）
        case 'weixin_qrcode': //微信支付（扫码）
        case 'HTML5':
        case 'wechat':
        case 'weixin_xcx':
          //在数组内的代理商处理
          if(['888','886'].findIndex(t=>baseInfo.agentInfo.agentCode==t)>=0){
            payInfo = baseInfo.mainWeixinPayInfo
            payInfo.seller_id = baseInfo.mainWeixinPayInfo.appID
          }else {
            payInfo = baseInfo.weixinPayInfo
            payInfo.seller_id = baseInfo.weixinPayInfo.appID
          }
          break
        default:
          throw new Error('无效的支付方式');
      }
      return payInfo
    }

    //获得支付链接
    async GetPayUrl(baseInfo,payInfo,orderInfo){
      //新版支付宝统一配置
      const alipayConfig = {
        notify_url:this.app.config.address+'/notify/alipayNotify',
        return_url:baseInfo.returnUrl,
        app_id:payInfo.AppID,
        seller_id:payInfo.PID,
        appPriKey:`-----BEGIN PRIVATE KEY-----\n` + payInfo.PrivateKey + `\n-----END PRIVATE KEY-----`,
        appPubKey:`-----BEGIN PUBLIC KEY-----\n` + payInfo.PublicKey + `\n-----END PUBLIC KEY-----`,
        aliPubKeyRSA2:`-----BEGIN PUBLIC KEY-----\n` + payInfo.AlipayPublick + `\n-----END PUBLIC KEY-----`,
        aliPubKeyRSA:`-----BEGIN PUBLIC KEY-----\n` + payInfo.AlipayPublick + `\n-----END PUBLIC KEY-----`,
        gateway:this.app.config.alipayGateway
      }
      let returnInfo = {}
      switch (baseInfo.type){
        case 'alipay': //支付宝支付(手机)
        case 'alipay_web': //支付宝支付(网页)
          let t = (baseInfo.type == 'alipay') ? 'phone' : 'web';
          payInfo.notify_url = this.app.config.address +'/notify/alipayNotifyKsbao';
          //生成支付链接
          // const alipayUrl = await this.ctx.service.alipay.getOldPayUrl(baseInfo.appInfo.appName,orderInfo.orderID,
          //     orderInfo.price, baseInfo.returnUrl, payInfo, t, baseInfo.returnUrl, payInfo, null, baseInfo.sandbox);
          // returnInfo.alipay = alipayUrl;
          // 新旧版支付宝支付自动设置
          if(!alipayConfig.app_id || alipayConfig.app_id===''){
            const alipayUrl = await this.ctx.service.alipay.getOldPayUrl(baseInfo.appInfo.appName, orderInfo.orderID,
              orderInfo.price, baseInfo.returnUrl, alipayConfig, t, baseInfo.returnUrl, baseInfo.alipayPayInfo, null);
            returnInfo.alipay = alipayUrl;
          }else{
            const alipayNewUrl = await this.ctx.service.alipay.getPayUrl(baseInfo.appInfo.appName, orderInfo.orderID, orderInfo.price, baseInfo.returnUrl,
              alipayConfig,t)
            returnInfo.alipay = alipayNewUrl
          }
          break;
        case 'alipay_app':
          //创建订单
          const alipayAppUrl = await this.ctx.service.alipay.getPayUrl(baseInfo.appInfo.appName, orderInfo.orderID, orderInfo.price, baseInfo.returnUrl,
            alipayConfig,'app')
          returnInfo.alipay = alipayAppUrl
          break
        case 'weixin': //微信支付（原生）
          payInfo.notify_url = this.app.config.address +'/notify/weixinNotifyKsbao';
          payInfo.mch_id = payInfo.partner;
          payInfo.gateway = 'https://api.mch.weixin.qq.com';
          payInfo.appid = payInfo.appID
          //console.log(payInfo)
          //生成支付链接
          // if(baseInfo.agentInfo.agentCode=='yuekao' || baseInfo.agentInfo.agentCode=='9131'){
          const weixinConfig = await this.ctx.service.process.kspay.getWeixinConfig(baseInfo)

          const wxmsg2 = await this.ctx.service.weixin.createOldOrder(baseInfo.appInfo.appName,orderInfo.orderID, orderInfo.price * 100, weixinConfig, 'phone');

          let signInfoxx = {
            appid:weixinConfig.appid,
            partnerid:weixinConfig.mch_id,
            prepayid: wxmsg2.prepay_id,
            timestamp:parseInt(new Date().getTime()/1000).toString(),
            noncestr:await this.ctx.service.process.kspay.getRandomString(16),
            package:'Sign='+wxmsg2.prepay_id,
            // signType:'MD5'
          }
          signInfoxx.sign = this.ctx.service.weixin.sign(this.ctx.service.weixin.stringifyParams(signInfoxx),{key:weixinConfig.key},'MD5');
          returnInfo.weixinInfo = {
            appid: weixinConfig.appid,
            partnerid:signInfoxx.partnerid,
            prepay_id: signInfoxx.prepayid,
            package:signInfoxx.package,
            timeStamp: signInfoxx.timestamp,
            nonceStr: signInfoxx.noncestr,
            sign: signInfoxx.sign
          }
          // }else{
          //     const wxmsg = await this.ctx.service.weixin.createOldOrder(baseInfo.appInfo.appName,orderInfo.orderID, orderInfo.price * 100, payInfo, 'phone');
          //     returnInfo.wxUrl = wxmsg;
          //     returnInfo.prepay_id = wxmsg.prepay_id;
          // }
          break;
        case 'weixin_qrcode': //微信支付（扫码）
          let tr = (baseInfo.type == 'weixin') ? 'phone' : 'qrcode';
          payInfo.notify_url = this.app.config.address + '/notify/weixinNotifyKsbao';
          payInfo.mch_id = payInfo.partner;
          payInfo.gateway = 'https://api.mch.weixin.qq.com';
          payInfo.appid = payInfo.appID;
          //生成支付链接
          const wxUrl = await this.ctx.service.weixin.createUnifiedOrder(baseInfo.appInfo.appName, orderInfo.orderID, orderInfo.price * 100, payInfo, tr);
          returnInfo.wxUrl = wxUrl;
          returnInfo.prepay_id = wxUrl.prepay_id;
          break;
        case 'apple': //苹果支付
          //苹果好像没什么可以生成的东西
          break;
        case 'HTML5':
          let signcfg = {
            notify_url: this.app.config.address + '/notify/weixinNotifyKsbao',
            mch_id: payInfo.partner,
            gateway: 'https://api.mch.weixin.qq.com',
            appid: payInfo.appID
          }
          payInfo.notify_url = this.app.config.address + '/notify/weixinNotifyKsbao';
          payInfo.mch_id = payInfo.partner;
          payInfo.gateway = 'https://api.mch.weixin.qq.com';
          payInfo.appid = payInfo.appID;

          if(baseInfo.agentInfo.agentCode!=='100052-1'){
            payInfo.mch_id = '1218349401';
            payInfo.appid = 'wx6a8be25225f47e8c';
            payInfo.key='KUFKjs16346ewf8p2LA6lao3pj15lefl';
          }
          //生成支付链接
          const wxUrl5 = await this.ctx.service.weixin.createUnifiedOrder(baseInfo.appInfo.appName, orderInfo.orderID, orderInfo.price * 100, payInfo, 'HTML5');
          returnInfo.wxUrl = wxUrl5;
          returnInfo.prepay_id = wxUrl5.prepay_id;
          returnInfo.mweb_url =baseInfo.returnUrl? wxUrl5.mweb_url+'&redirect_url='+baseInfo.returnUrl:wxUrl5.mweb_url;
          break;
        case 'wechat':

          let wechatJson = {
            orderID:orderInfo.orderID,
            type:'wechat',
            appName:baseInfo.appInfo.appName
          }
          //console.log(wechatJson)
          payInfo.mch_id = payInfo.partner;
          payInfo.appid = payInfo.appID;
          if(baseInfo.agentCode!=='100052-1'){
            payInfo.mch_id = '1218349401';
            payInfo.appid = 'wx6a8be25225f47e8c';
            payInfo.key='KUFKjs16346ewf8p2LA6lao3pj15lefl';
          }
          ////console.log(this.ctx.service.weixin.sign(this.ctx.service.weixin.stringifyParams(wechatJson),{key:weixinPayInfo.appid}))
          wechatJson.sign = this.ctx.service.weixin.sign(this.ctx.service.weixin.stringifyParams(wechatJson),{key:payInfo.appid});
          wechatJson.return_url = baseInfo.returnUrl;
          //console.log(wechatJson)
          let turl =  'https://byhzs.ksbao.com/qRcodePayNew?'+this.ctx.service.weixin.stringifyParams(wechatJson);
          returnInfo.wechat_url = 'https://open.weixin.qq.com/connect/oauth2/authorize?appid='+payInfo.appid+'&redirect_uri='
            +encodeURIComponent(turl)+'&response_type=code&scope=snsapi_base#wechat_redirect';
          //通过getOpenID接口生成支付连接所需参数
          break;
        case 'weixin_xcx':
          payInfo.gateway = 'https://api.mch.weixin.qq.com';
          payInfo.notify_url = this.app.config.address + '/notify/weixinNotifyKsbao';
          payInfo.mch_id = '1218349401';
          payInfo.appid = 'wx0792feb530d11acb';
          payInfo.key='KUFKjs16346ewf8p2LA6lao3pj15lefl';

          const wechatmsg = await this.ctx.service.weixin.createUnifiedOrder(baseInfo.appInfo.appName, orderInfo.orderID, orderInfo.price * 100, payInfo, 'wechat',baseInfo.openID);
          //console.log(wechatmsg)
          //生成签名
          let signInfo = {
            appId:payInfo.appid,
            timeStamp:parseInt(new Date().getTime()/1000).toString(),
            nonceStr:this.getRandomString(16),
            package:'prepay_id='+wechatmsg.prepay_id,
            signType:'MD5'
          }
          //console.log(signInfo)
          signInfo.paySign = this.ctx.service.weixin.sign(this.ctx.service.weixin.stringifyParams(signInfo),{key:payInfo.key},'MD5');
          let returnPayInfo = {
            prepay_id : wechatmsg.prepay_id,
            appid:payInfo.appid,
            timeStamp:signInfo.timeStamp,
            nonceStr:signInfo.nonceStr,
            sign:signInfo.paySign
          }
          returnInfo.xcxInfo = returnPayInfo;
          break;
        default:
          throw new Error('无效的支付方式');
      }
      return returnInfo
    }
    //查询是否考季卡
    async CheckKJK(baseInfo){
      //获取考季卡时间
      //let endTime = this.ctx.service.time.checkEndTime(baseInfo.appInfo.appID,baseInfo.toVnInfo.vn,null,baseInfo.toPriceInfo.days)
      let endTime = this.ctx.service.process.service.getKJKInfo(baseInfo.appInfo.appID,baseInfo.toVnInfo.vn)

      //判断是否考季卡
      if(endTime){
        //查询补差价购买记录,补差价升级的科目只允许一次
        let userOrderInfo = await this.ctx.service.process.service.getUserOrderInfo(['userOrderID'],{status:1,effectType:baseInfo.toVnInfo.vn,userID:baseInfo.userInfo.userID,appID:baseInfo.appInfo.appID,vn:{$ne:null}})
        if(userOrderInfo){
          throw new Error('该科目只允许原价购买');
        }
        //考前小于7天都不允许参与补差价购买
        let current = new Date().getTime() //毫秒
        let end = new Date(endTime).getTime() //毫秒
        let compare = 7 * 24 * 60 * 60 * 1000 //毫秒
        if(current > end){
          throw new Error('该科目已经到期');
        }
        if(current + compare > end){
          throw new Error('该科目即将到期');
        }
      }else{
        //年卡
        //判断班次到期时间是否小于7天
        if(new Date(baseInfo.vipInfo.endTime).getTime()-new Date().getTime()<7*24*60*60*1000){
          throw new Error('该科目即将到期,无法升级班次');
        }

      }


    }
    //获取关联书籍信息
    async getBookExtend(subJson){
      try{
        //查询关联书籍
        let inputBookID = JSON.parse(subJson);
        let findJson = {
          attributes:['BookID' , 'ToBookID'],
          where:{
            BookID:inputBookID
          },
          raw: true
        }
        // console.log(findJson)
        let bookListInfo = await dbBook.exec('bookextend', 'findAll', findJson);
        if(bookListInfo && bookListInfo.length>0){
          bookListInfo = bookListInfo.map(t=>t.ToBookID)
          bookListInfo = bookListInfo.concat(inputBookID)
          return bookListInfo;
        }
        return [null];
      }
      catch(e){
        this.logger.info(e)
        return [null];
      }

    }
  }
  return Service;
}
