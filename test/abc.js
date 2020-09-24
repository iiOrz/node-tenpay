'use strict';
//官方充值购买流程
module.exports = app => {

  class Service extends app.Service {
    async start({userID,appEName,couponID,vn,returnUrl,agentCode,payType,equipment,buyChannel,sandbox,openID,ip,branchBookList,couponUserID,contentType,content,hbfqnum,contents}) {
      //获得基本信息
      let baseInfo = await this.getBasicInfo(userID, appEName, couponID, vn, returnUrl, agentCode, payType, equipment, buyChannel, sandbox,branchBookList,couponUserID,ip,openID,contentType,content,hbfqnum,contents)
      //验证基本信息
      await this.checkBasicInfo(baseInfo)
      //验证黑白名单
      await this.checkCoupon(baseInfo);
      //验证价格、代理商、优惠券信息
      await this.checkPriceInfo(baseInfo)


      //验证是否符合考季卡,年卡购买规则
      await this.checkKJK(baseInfo)
      //生成订单信息
      let payOrderInfo = await this.payOrderInfo(baseInfo)
      await this.checkOrderInfo(payOrderInfo)
      //生成支付连接,返回订单详情
      let orderPay = await this.orderPay(baseInfo,payOrderInfo)
      return {status:200,data:orderPay}
    }

    //获得基本信息
    async getBasicInfo(userID, appEName, couponID, vn, returnUrl, agentCode, payType, equipment, buyChannel,sandbox,branchBookList,couponUserID,ip,openID,contentType,content,hbfqnum,contents) {
      //不需要查询的信息
      let baseInfo = { returnUrl, payType, equipment, buyChannel,sandbox,branchBookList,ip,openID,contentType,content,hbfqnum,contents}
      //启动事务
      let self = this;
      await self.ctx.service.process.service.useTransaction(await async function (t) {
        //获取用户信息
        baseInfo.userInfo = await self.ctx.service.process.service.getUserInfo(['userID', 'userName'], {userID}, t)
        //获取科目信息
        baseInfo.appInfo = await self.ctx.service.process.service.getAppInfo(['appID', 'appEName', 'appName', 'CName'], {appEName}, t)
        //获取用户优惠券信息
        baseInfo.couponUserInfo = couponUserID ? await self.ctx.service.process.service.getCouponUserListInfo(['ID','couponUserID','couponID', 'endTime','offPrice', 'status','discount','useCouponLimit','repeatList'], {
          userID,
          $or:[{couponUserID},{ID:couponUserID}]
        }, t) : false
        baseInfo.couponManageInfo = baseInfo.couponUserInfo?await self.ctx.service.process.service.getSimpleInfo('couponmanage',{couponID:baseInfo.couponUserInfo.map(t=>t.couponID)},['couponID','name','couponLimitJson','groupid','closeTime'],'findAll'):false
        //获取优惠券信息
        //baseInfo.couponInfo = couponID ? await self.ctx.service.process.service.getCouponInfo(['couponJson','couponLimitJson','typeID'], {couponID}, t) : false
        //获取优惠券信息
        baseInfo.couponInfo = couponUserID ? await self.ctx.service.process.service.getCouponInfo(['couponJson','couponLimitJson','typeID'], {couponID:baseInfo.couponUserInfo.map(t=>t.couponID)}, t) : false
        //获取班次信息
        baseInfo.vnInfo = await self.ctx.service.process.service.getVnInfo(['vn', 'vname','rules'], {vn}, t)
        //获取价格信息
        baseInfo.priceInfo = await self.ctx.service.process.service.getPriceInfo(['price', 'discount', 'appClassID','subCount','subPrice','subJson','days','subAppClassID'], {
          appID: baseInfo.appInfo.appID,
          vn,
          enable:1
        },t)
        //获取代理商信息
        baseInfo.agentInfo = await self.ctx.service.process.service.getAgentInfo(['agentCode','enable','isWeixinPay','weixinPay','phonePayUrl','pcPayUrl','weixinPayUrl',"payJson","huabeiJson",'newSmp'],{agentCode},t)
        //获取代理商支付配置
        baseInfo.alipayPayInfo = await self.ctx.service.process.service.getAgentInfoByAlipay(['enabled', 'Keys', 'WapKey', 'PID', 'Agent_ID', 'Alipay_NO','enable','AppID','PrivateKey','PublicKey','AlipayPublick'], {agent_id: agentCode},t)
        //获取代理商微信配置
        baseInfo.weixinPayInfo = await self.ctx.service.process.service.getAgentInfoByWechat(['enabled', 'key', 'appID', 'partner','enable','isOfficial'], {agentCode},t)
        //官方的
        baseInfo.mainAlipayPayInfo = await self.ctx.service.process.service.getAgentInfoByAlipay(['enabled', 'Keys', 'WapKey', 'PID', 'Agent_ID', 'Alipay_NO','enable','AppID','PrivateKey','PublicKey','AlipayPublick'], {agent_id: 888},t)
        //获取代理商微信配置
        //baseInfo.mainWeixinPayInfo = await self.ctx.service.process.service.getAgentInfoByWechat(['enabled', 'key', 'appID', 'partner'], {agentCode:888},t)
        //获取微信公众号,HTML5，小程序用的官方收款帐号
        baseInfo.wechatWeixinPayInfo = await self.ctx.service.process.service.getAgentInfoByWechat(['agentCode','payName','partner','key','appID','appSecret','phone','QQ','enabled','isOfficial','isPublicAccounts','enable'], {agentCode:'WXJSAPI'},t)
        //获取app原生支付，扫码用官方收款帐号
        baseInfo.appWeixinPayInfo = await self.ctx.service.process.service.getAgentInfoByWechat(['agentCode','payName','partner','key','appID','appSecret','phone','QQ','enabled','isOfficial','isPublicAccounts','enable'], {agentCode:'888'},t)
        //获取购买科目信息,到期时间
        baseInfo.vipInfo = await self.ctx.service.process.service.getVipInfo(['endTime'],{appID:baseInfo.appInfo.appID,vn:baseInfo.vnInfo.vn,userID:baseInfo.userInfo.userID},t)
        //查询优惠券关联
        baseInfo.couponGroupextendInfo = baseInfo.couponUserInfo? await self.ctx.service.process.service.getSimpleInfo('coupongroupextend',{couponID:baseInfo.couponUserInfo.map(t=>t.couponID)},['groupID'],'findAll'):false
        //通过关联查询优惠券信息
        baseInfo.couponGroup = baseInfo.couponGroupextendInfo? await self.ctx.service.process.service.getSimpleInfo('coupongroup',{ID:baseInfo.couponGroupextendInfo.map(t=>t.groupID)},['overlay'],'findAll'):false
      })
      console.log(baseInfo.agentInfo)
      //获取代理商可用支付配置
      if(baseInfo.agentInfo&&baseInfo.agentInfo.payJson){
        baseInfo.agentInfo.payJson = JSON.parse(baseInfo.agentInfo.payJson);
      }
      ////判断代理商是否激活状态
      //if(baseInfo.agentInfo&&baseInfo.agentInfo.enable===1){
      //    //如果代理商没有自己的支付宝信息就使用官方数据,也就是支付到官方
      //    if(!baseInfo.alipayPayInfo&&baseInfo.mainAlipayPayInfo){
      //        baseInfo.alipayPayInfo = baseInfo.mainAlipayPayInfo;
      //    }
      //    //如果代理商没有微信信息或者关闭状态，并且旧版微信支付未设置，默认支付到官方
      //    if((!baseInfo.weixinPayInfo||baseInfo.weixinPayInfo.enable!==1)&&baseInfo.mainWeixinPayInfo&&baseInfo.agentInfo.weixinPay!==1){
      //        baseInfo.weixinPayInfo = baseInfo.mainWeixinPayInfo;
      //    }
      //}
      return baseInfo;
    }

    //验证基本信息
    async checkBasicInfo(baseInfo) {
      if (!baseInfo.userInfo) {
        throw new Error('该用户不存在');
      }
      if (!baseInfo.appInfo) {
        throw new Error('该科目不存在');
      }
      if(!baseInfo.priceInfo){
        throw new Error('该科目班次不存在');
      }
      if (!baseInfo.couponUserInfo  && baseInfo.couponUserInfo !== false) {
        throw new Error('用户该优惠券不存在');
      }
      for(let cui in baseInfo.couponUserInfo){
        if (baseInfo.couponUserInfo[cui].status && baseInfo.couponUserInfo[cui].status !== 0) {
          throw new Error('该优惠卷已使用');
        }
        if (baseInfo.couponUserInfo[cui].endTime > new Date().toString()) {
          throw new Error('该优惠券已过期');
        }
      }

      if ((!baseInfo.couponInfo && baseInfo.couponInfo !== false)||(!baseInfo.couponManageInfo && baseInfo.couponManageInfo !== false)) {
        throw new Error('优惠券不存在');
      }
      //叠加判断
      if(baseInfo.couponManageInfo && baseInfo.couponManageInfo.length>0 &&baseInfo.couponUserInfo.length>1){
        if(baseInfo.couponManageInfo.length===1){
          //自身叠加流程,获取最大叠加数量判断uselimit
          let limitjson = JSON.parse(baseInfo.couponManageInfo[0].couponLimitJson||{})
          if(limitjson.uselimit<baseInfo.couponUserInfo.length){
            throw new Error('优惠券叠加数量已达到上限');
          }
        }else{
          //不同叠加流程
          for(let i in baseInfo.couponGroup){
            if(baseInfo.couponGroup[i].overlay!==1){
              throw new Error('使用的优惠券无法相互叠加');
            }
          }
        }
      }


      if(baseInfo.couponManageInfo && baseInfo.couponManageInfo.length===1){
        if(baseInfo.couponManageInfo[0].closeTime&&new Date(baseInfo.couponManageInfo[0].closeTime)<new Date()){
          throw new Error('该活动已关闭');
        }
      }
      if (!baseInfo.vnInfo.vn && baseInfo.vnInfo.vn !== 0) {
        throw new Error('该班次不存在');
      }
      if (!baseInfo.agentInfo) {
        throw new Error('该代理商不存在');
      }
      if (baseInfo.agentInfo.enable===0) {
        throw new Error('该代理商不存在');
      }
      if(!baseInfo.alipayPayInfo&&!baseInfo.mainAlipayPayInfo){
        throw new Error('该代理商暂时无法支付');
      }
      if(baseInfo.alipayPayInfo&&baseInfo.alipayPayInfo.enable===0){
        throw new Error('该代理商不支持支付');
      }
      if(baseInfo.weixinPayInfo&&baseInfo.weixinPayInfo.enable===0){
        throw new Error('该代理商不支持支付');
      }
      if(baseInfo.agentInfo.weixinPay===1&&!baseInfo.weixinPayInfo){
        throw new Error('该代理商暂时无法支付');
      }
      if(!baseInfo.agentInfo.payJson){
        throw new Error('该代理商暂时不支持支付');
      }
      if(baseInfo.agentInfo.payJson[baseInfo.payType]!==true&&baseInfo.agentInfo.payJson[baseInfo.payType]!=='true'){
        throw new Error('代理商暂时不支持该支付方式');
      }
      if(['wechat','HTML5','weixin_xcx'].findIndex(t=>t==baseInfo.payType)>=0){
        if(!baseInfo.weixinPayInfo&&!baseInfo.wechatWeixinPayInfo){
          throw new Error('该代理商暂时无法支付');
        }
        if(baseInfo.agentInfo.weixinPay!==1&&!baseInfo.wechatWeixinPayInfo){
          throw new Error('该代理商暂时无法支付');
        }
      }else {
        if(!baseInfo.weixinPayInfo&&!baseInfo.appWeixinPayInfo){
          throw new Error('该代理商暂时无法支付');
        }
        if(baseInfo.agentInfo.weixinPay!==1&&!baseInfo.appWeixinPayInfo){
          throw new Error('该代理商暂时无法支付');
        }
      }
      //验证选中书籍181214
      if(baseInfo.branchBookList){
        try{
          let bookList = JSON.parse(baseInfo.branchBookList);
          let subJson = JSON.parse(baseInfo.priceInfo.subJson);
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
            //return {status: 201, msg: '选中的课程不一致'}
            throw new Error('选中的课程不一致');
          }
          //if(bookResult===baseJson.subCount){
          //    baseJson.branchBookList = null
          //}
        }
        catch(ex){
          //console.log(ex.message)
          throw new Error('选中的课程有误');
        }
      }
      //19.4.24增加购买限制功能
      this.ctx.service.process.kspay.getCodeLimit(baseInfo.userInfo.userID,baseInfo.appInfo.appID,baseInfo.vnInfo.vn)
    }

    //验证优惠券信息
    async checkPriceInfo(baseInfo) {
      if (!baseInfo.priceInfo.price) {
        throw new Error('该班次价格未定义');
      }
      if (baseInfo.couponInfo && baseInfo.couponUserInfo) {
        for (let c in baseInfo.couponInfo) {
          let couponJson = JSON.parse(baseInfo.couponInfo[c].couponLimitJson)
          let offprice = couponJson.offprice
          let limitprice = couponJson.limitprice
          let appENameList = couponJson.appEName
          let agentCode = couponJson.agentCode
          let vn = couponJson.vn
          let appNoENameList = couponJson.noappEName
          let novn = couponJson.novn

          if (limitprice && parseFloat(limitprice) > parseFloat(baseInfo.priceInfo.price)) {
            throw new Error('该价格不适合使用此优惠券');
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
              throw new Error('该优惠券的使用科目不正确');
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
              throw new Error('该优惠券的只能在指定的代理商使用');
            }
          }
          if (vn) {
            let m = false
            for (let r of vn) {
              if (baseInfo.vnInfo.vn.toString() === r.toString()) {
                m = true
                break
              }
            }
            if (m === false) {
              throw new Error('该优惠券的只能在指定的班次使用')
            }
          }
          if(appNoENameList){
            for (let i of appNoENameList) {
              if (baseInfo.appInfo.appEName === i) {
                throw new Error('该优惠券的使用科目不正确');
                break
              }
            }
          }
          if(novn){
            for (let r of novn) {
              if (baseInfo.vnInfo.vn.toString() === r.toString()) {
                throw new Error('该优惠券的只能在指定的班次使用')
                break
              }
            }
          }
        }
      }
      // 19.4.2 type=115优惠券规则
      if(baseInfo.couponInfo&&baseInfo.couponInfo.length>0){
        if(baseInfo.couponInfo.length>1){
          let bj = -1
          for(let i in baseInfo.couponInfo){
            let ctypeid = baseInfo.couponInfo[i].typeID
            //let cid = baseInfo.couponInfo[i].
            //不同活动的优惠券不能叠加
            if(i==0){
              bj = ctypeid
            }else if(bj!==ctypeid){
              throw new Error('不同活动的优惠券不能叠加使用')
            }
            //不符合typeid的不允许叠加
            if([115,116].findIndex(t=>ctypeid==t)==-1){
              throw new Error('选择的活动优惠券不能叠加使用，请重新选择')
            }
          }
        }


        let rule1 = []
        let rule2 = []
        let rule3 = []
        let rule4 = false
        let rule5 = []
        for(let j in baseInfo.couponUserInfo){
          let couponid = baseInfo.couponUserInfo[j].couponID
          //是1元/2元/3元的无门槛券能和5元/10元/15元叠加

          //1元/2元/3元的无门槛券只能和满200-10的优惠券叠加
          if([116,117,118,119,120,121].findIndex(t=>t===couponid)>=0){
            rule1.push(couponid)
          }
          if(123===couponid){
            rule4 = true
          }
          //5元/10元/15元不给自身叠加 5元/10元/15元的可以和所有优惠券叠加（三张选择一张）
          if([119,120,121].findIndex(t=>t===couponid)>=0){
            rule2.push(couponid)
          }
          //减满不给叠加
          if([122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141].findIndex(t=>t===couponid)>=0){
            rule3.push(couponid)
          }
          //19.7.10 type=117优惠券规则
          if([181,182,183,184,185,186,187].findIndex(t=>t===couponid)>=0){
            rule5.push(couponid)
          }
        }
        if(rule2.length>=2||rule3.length>=2){
          throw new Error('选择的优惠券组合不能叠加使用，请重新选择')
        }
        if(rule4===true&&rule1.length+1!==baseInfo.couponUserInfo.length){
          throw new Error('选择的优惠券不能叠加使用，请重新选择')
        }
        if(rule5.length>=2){
          throw new Error('选择的活动优惠券不能叠加使用，请重新选择')
        }
      }

    }

    //获取订单信息
    async payOrderInfo(baseInfo) {
      //订单类型
      let userOrderType= await this.ctx.service.eventsell.eventsellservice.getPayOrderType(baseInfo.agentInfo.agentCode) || 'kspay';

      // if(this.ctx.service.eventsell)
      //优惠券打折金额
      //let offprice = 0
      //try {
      //    if(baseInfo.couponInfo&&baseInfo.couponUserInfo) {
      //        for(let c in baseInfo.couponUserInfo){
      //            offprice += parseFloat(baseInfo.couponUserInfo[c].offPrice)
      //            //console.log(baseInfo.couponUserInfo[c].offPrice)
      //        }
      //        offprice = Math.round(offprice*100)/100
      //    }
      //}
      //catch (e){
      //    throw new Error('无效的支付金额');
      //}
      //获取打折价格
      let offprice = await this.ctx.service.process.kspay.getoffprice(baseInfo)
      //获取科目系列ID
      let appClassID = baseInfo.priceInfo.appClassID
      //付款总价
      let totalPrice = (parseFloat(baseInfo.priceInfo.price) - parseFloat(offprice || 0)) * parseFloat(await this.ctx.service.process.kspay.getDiscount(baseInfo) || 1)
      baseInfo.price = totalPrice
      if(baseInfo.vn=236){
        baseInfo.price = Math.round(totalPrice)
        totalPrice = Math.round(totalPrice)
      }
      //中级课程价格181218
      if(baseInfo.branchBookList){
        let subPrice = baseInfo.priceInfo.subPrice;
        let subCount = baseInfo.priceInfo.subCount;
        let bookCount = JSON.parse(baseInfo.branchBookList).length;
        if(subPrice && subCount > 0){
          if(subCount>bookCount){
            //获得价格(单本课本价格 * 数量)
            baseInfo.priceInfo.price = parseFloat(subPrice) * parseFloat(bookCount)
            totalPrice = (parseFloat(baseInfo.priceInfo.price) - parseFloat(offprice || 0)) * parseFloat(await this.ctx.service.process.kspay.getDiscount(baseInfo) || 1)
            userOrderType = 'privatesubject';
            appClassID = baseInfo.priceInfo.subAppClassID;
          }else if(subCount===bookCount){
            //获得全价 totalPrice 不变
            userOrderType = 'privatesubject';
            appClassID = baseInfo.priceInfo.appClassID;
          }else {
            throw new Error('该课程类型不一致');
          }
        }else {
          throw new Error('未添加该课程');
        }
      }

      let orderParams = {
        userID:baseInfo.userInfo.userID, //用户ID
        appID:baseInfo.appInfo.appID, //软件ID
        orderID:this.ctx.service.order.newOrderID(baseInfo.userInfo.userID), //订单号,我们自己生成
        payType:baseInfo.payType, //支付类型
        agentCode:baseInfo.agentInfo.agentCode, //代理商编号
        appClassID:appClassID, //软件系列ID
        price:totalPrice, //价格
        originalPrice:baseInfo.priceInfo.price,
        equipment:baseInfo.equipment, //下单设备类型
        buyChannel:baseInfo.buyChannel, //购买渠道，区别同一个产品在不同渠道的购买情况
        vn:baseInfo.vnInfo.vn,
        userOrderType:userOrderType,
        //seller_id:baseInfo.seller_id,
        //couponUserID:baseInfo.couponUserInfo?JSON.stringify(baseInfo.couponUserInfo.map(t=>t.couponUserID)):null,//改为多个优惠券叠加
        user_ip:baseInfo.ip,
        subJson:baseInfo.branchBookList,
        effectType:null,
        days:baseInfo.priceInfo.days,
        contentJson:JSON.stringify({contentType:baseInfo.contentType,content:baseInfo.content}),
        directPay:baseInfo.agentInfo.newSmp
      }
      //单个优惠券
      if(typeof baseInfo.couponUserInfo==='number'){
        orderParams.couponUserID = baseInfo.couponUserInfo.couponUserID
      }
      //多个优惠券叠加
      if(typeof baseInfo.couponUserInfo==='object'){
        orderParams.couponUserID = JSON.stringify(baseInfo.couponUserInfo.map(t=>t.couponUserID))
      }
      if(isNaN(orderParams.price)){
        throw new Error('未定义价格');
      }
      if(isNaN(orderParams.originalPrice)){
        throw new Error('未定义的价格');
      }
      // //单科appclassid的处理
      // if(baseInfo.branchBookList){
      //     //如果是单科，使用单科appclassid
      //     orderParams.appClassID = baseInfo.priceInfo.subAppClassID;
      // }
      return orderParams;
    }
    //验证订单信息
    async checkOrderInfo(orderInfo){
      if(!orderInfo.price){
        throw new Error('该科目价格不存在');
      }
      if(!orderInfo.orderID){
        throw new Error('该订单不存在')
      }
    }
    //创建订单
    async createOrder(baseInfo,orderInfo,payID){
      orderInfo.seller_id = payID;
      orderInfo.huabei = baseInfo.hbfqnum;
      //orderInfo.user_ip = ip;
      //console.log(orderInfo)
      //启动事务
      let self = this;
      await self.ctx.service.process.service.useTransaction(await async function (t) {
        //创建订单
        await self.ctx.service.process.service.addOrder(orderInfo,t)
        //锁定优惠券,181119去掉下单锁定优惠券功能，改为开通锁定优惠券
        //if(baseJson.useCoupon){
        //    await self.ctx.service.process.service.lockCouponUser(couponUserInfo.couponUserID, t)
        //}
      })
    }
    //微信公众号支付获取openid
    async getOpenID({code,type,orderID,appName,sign}){
      //获取订单信息
      let orderInfo = await this.ctx.service.order.getOrder(orderID);
      if(!orderInfo){
        return {status:201,msg:'参数未通过验证'}
      }
      //console.log(orderInfo)
      //获取微信支付配置
      let pjson = {'100052-1':true,'886':true,'100006-1':true,'100401-1':true,'101226-1':true,'100329-1':true,'100088-1':true,'101226-2':true,'100748-1':true,'300189-1':true}
      let weixinPayInfo;
      if(orderInfo.AgentCode==='888'||orderInfo.AgentCode==='889'){
        weixinPayInfo = await this.ctx.service.process.service.getAgentInfoByWechat(['enabled', 'key', 'appID', 'partner','enable','appSecret'], {agentCode:'WXJSAPI'})
      }else if(pjson[orderInfo.AgentCode]==true){
        weixinPayInfo = await this.ctx.service.process.service.getAgentInfoByWechat(['enabled', 'key', 'appID', 'partner','enable','appSecret'], {agentCode:orderInfo.AgentCode})
      }else {
        weixinPayInfo = await this.ctx.service.process.service.getAgentInfoByWechat(['enabled', 'key', 'appID', 'partner','enable','appSecret'], {agentCode:'WXJSAPI'})
      }
      //console.log(weixinPayInfo)
      if(!weixinPayInfo){
        return {status:201,msg:'该代理商暂时无法支付'}
      }
      //验证参数签名
      let signJson = {
        orderID,type,appName
      }
      //console.log(this.ctx.service.weixin.sign(this.ctx.service.weixin.stringifyParams(signJson),{key:weixinPayInfo.appID}))
      let paramsVerify = await this.ctx.service.weixin.verify(signJson,sign,{key:weixinPayInfo.appID},'HMAC-SHA256');
      if(!paramsVerify){
        //console.log('验证失败')
        return {status:201,msg:'验证失败'}
      }

      //获取openid
      let tokenUrl = 'https://api.weixin.qq.com/sns/oauth2/access_token?appid='+weixinPayInfo.appID+'&secret='+
        weixinPayInfo.appSecret+'&code='+code+'&grant_type=authorization_code';
      let tokenData = {
        appid:weixinPayInfo.appID,
        secret:weixinPayInfo.appSecret,
        code,
        grant_type:'authorization_code'
      }
      const result = await this.ctx.curl(tokenUrl, {
        method: 'GET',
        // 通过 contentType 告诉 HttpClient 以 JSON 格式发送
        //contentType: 'json',
        data:tokenData,
        // 明确告诉 HttpClient 以 JSON 格式处理返回的响应 body
        dataType: 'json',
        timeout: 5000,
      });
      console.log('获取openid')
      console.log(result);
      if (result.status != 200) {
        throw new Error('访问充值码服务器失败');
      }
      if(!result){
        return {status:201,msg:'获取失败0'}
      }
      if(result.status!==200){
        return {status:201,msg:'获取失败'+statusCode}
      }
      //微信统一下单
      weixinPayInfo.notify_url = app.config.address + '/notify/weixinNotify';
      weixinPayInfo.mch_id = weixinPayInfo.partner;
      weixinPayInfo.gateway = 'https://api.mch.weixin.qq.com';
      weixinPayInfo.appid = weixinPayInfo.appID;
      const wechatmsg = await this.ctx.service.weixin.createUnifiedOrder(appName, orderInfo.OrderID, orderInfo.Price * 100, weixinPayInfo, 'wechat',result.data.openid);
      console.log('统一下单信息')
      console.log(wechatmsg)
      //生成签名
      let signInfo = {
        appId:weixinPayInfo.appID,
        timeStamp:parseInt(new Date().getTime()/1000).toString(),
        nonceStr:this.getRandomString(16),
        package:'prepay_id='+wechatmsg.prepay_id,
        signType:'MD5'
      }
      console.log('签名信息')
      console.log(signInfo)
      signInfo.paySign = this.ctx.service.weixin.sign(this.ctx.service.weixin.stringifyParams(signInfo),{key:weixinPayInfo.key},'MD5');
      //生成返回对象
      let returnInfo = {
        orderID: orderInfo.OrderID, //生成的订单号
        prepay_id : wechatmsg.prepay_id,
        appid:weixinPayInfo.appID,
        timeStamp:signInfo.timeStamp,
        nonceStr:signInfo.nonceStr,
        sign:signInfo.paySign
      }
      console.log('最终返回数据')
      console.log(returnInfo)
      return returnInfo
    }
    //获取随机字符
    getRandomString(len) {
      len = len || 32;
      var chars = 'ABCDEFGHJKMNPQRSTWXYZ'; // 默认去掉了容易混淆的字符oOLl,9gq,Vv,Uu,I1
      var maxPos = chars.length;
      var pwd = '';
      for (let i = 0; i < len; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * maxPos));
      }
      return pwd;
    }
    //下单,生成支付连接
    async orderPay(baseInfo,orderInfo){
      //生成返回对象
      let returnInfo = {
        orderID: orderInfo.orderID, //生成的订单号
        userName: baseInfo.userInfo.userName, //用户名
        softName: baseInfo.appInfo.CName + baseInfo.vnInfo.vname, //科目名称
        price: Math.round(orderInfo.price*100)/100, //价格
        days: 366, //时长
        alipay: null, //支付宝支付链接
        wxUrl: null, //微信二维码url
        prepay_id: null, //预支付ID（APP封壳支付需要）
        contentJson:baseInfo.content
      }

      //新版支付宝统一配置
      const alipayConfig = await this.getAlipayConfig(baseInfo)
      //微信统一配置
      const weixinConfig = await this.getWeixinConfig(baseInfo)

      //生成支付链接
      switch (baseInfo.payType) {
        case 'alipay': //支付宝支付(手机)
        case 'alipay_web': //支付宝支付(网页)
          let t = (baseInfo.payType == 'alipay') ? 'phone' : 'web';
          baseInfo.alipayPayInfo.notify_url = app.config.address +'/notify/alipayNotify';
          //创建订单
          await this.createOrder(baseInfo,orderInfo,baseInfo.alipayPayInfo.PID);
          if(alipayConfig.app_id===''){
            const alipayUrl = await this.ctx.service.alipay.getOldPayUrl(returnInfo.softName, returnInfo.orderID,
              orderInfo.price, baseInfo.returnUrl, alipayConfig, t, baseInfo.returnUrl, baseInfo.alipayPayInfo, null);
            returnInfo.alipay = alipayUrl;
          }else{
            const alipayNewUrl = await this.ctx.service.alipay.getPayUrl(returnInfo.softName, returnInfo.orderID, orderInfo.price, baseInfo.returnUrl,
              alipayConfig,t)
            returnInfo.alipay = alipayNewUrl
          }

          break;
        case 'alipay_app'://支付宝支付(原生)
          //创建订单
          await this.createOrder(baseInfo,orderInfo,baseInfo.alipayPayInfo.PID);
          const alipayAppUrl = await this.ctx.service.alipay.getPayUrl(returnInfo.softName, returnInfo.orderID, orderInfo.price, baseInfo.returnUrl,
            alipayConfig,'app')
          returnInfo.alipay = alipayAppUrl
          break
        case 'weixin': //微信支付（原生）

          //baseInfo.weixinPayInfo.notify_url = app.config.address +'/notify/weixinNotifyKsbao';
          //baseInfo.weixinPayInfo.mch_id = baseInfo.weixinPayInfo.partner;
          //baseInfo.weixinPayInfo.gateway = 'https://api.mch.weixin.qq.com';
          //baseInfo.weixinPayInfo.appid = baseInfo.weixinPayInfo.appID
          ////console.log(baseInfo.weixinPayInfo)
          //创建订单,锁定优惠卷
          await this.createOrder(baseInfo, orderInfo, baseInfo.weixinPayInfo.appID);


          // const wxmsg = await this.ctx.service.weixin.sandboxTest(returnInfo.softName,returnInfo.orderID, returnInfo.price * 100, weixinConfig, 'phone',1);
          const wxmsg = await this.ctx.service.weixin.createOldOrder(returnInfo.softName,returnInfo.orderID, returnInfo.price * 100, weixinConfig, 'phone');
          returnInfo.wxUrl = wxmsg.code_url;
          returnInfo.prepay_id = wxmsg.prepay_id;
          returnInfo.key = wxmsg.key
          // if(baseInfo.agentInfo.agentCode=='yuekao'  || baseInfo.agentInfo.agentCode=='9130' || baseInfo.agentInfo.agentCode=='9131' || baseInfo.agentInfo.agentCode=='9133'|| baseInfo.agentInfo.agentCode=='9070'|| baseInfo.agentInfo.agentCode=='9080'){
          let signInfoxx = {
            appid:weixinConfig.appid,
            partnerid:weixinConfig.mch_id,
            prepayid: wxmsg.prepay_id,
            timestamp:parseInt(new Date().getTime()/1000).toString(),
            noncestr:this.getRandomString(16),
            package:'Sign='+wxmsg.prepay_id,
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
          // }
          break;
        case 'weixin_qrcode': //微信支付（扫码）
          //创建订单,锁定优惠卷
          await this.createOrder(baseInfo, orderInfo, baseInfo.weixinPayInfo.appID);
          const wxUrl = await this.ctx.service.weixin.createUnifiedOrder(returnInfo.softName, returnInfo.orderID, returnInfo.price * 100, weixinConfig, 'qrcode');
          returnInfo.wxUrl = wxUrl.code_url;
          returnInfo.prepay_id = wxUrl.prepay_id;
          break;
        case 'apple': //苹果支付
          //苹果好像没什么可以生成的东西
          //创建订单,锁定优惠卷
          await this.createOrder(baseInfo, orderInfo, null);
          break;
        case 'HTML5':
          //创建订单,锁定优惠卷
          await this.createOrder(baseInfo, orderInfo, weixinConfig.appid);
          const wxUrl5 = await this.ctx.service.weixin.createUnifiedOrder(returnInfo.softName, returnInfo.orderID, returnInfo.price * 100, weixinConfig, 'HTML5');
          returnInfo.wxUrl = wxUrl5.code_url;
          returnInfo.prepay_id = wxUrl5.prepay_id;
          returnInfo.mweb_url =baseInfo.returnUrl? wxUrl5.mweb_url+'&redirect_url='+baseInfo.returnUrl:wxUrl5.mweb_url;
          break;
        case 'wechat':
          //以下为获取code拼接URL
          //创建订单,锁定优惠卷
          await this.createOrder(baseInfo, orderInfo, weixinConfig.appid);
          //做json参数签名。该json将被getOpenID接口获取，获取参数后先做签名验证才能正常使用
          let wechatJson = {
            orderID:returnInfo.orderID,
            type:'wechat',
            appName:returnInfo.softName
          }
          wechatJson.sign =  this.ctx.service.weixin.sign(this.ctx.service.weixin.stringifyParams(wechatJson),{key:weixinConfig.appid})
          // wechatJson.local = 'test'
          //设置同步回调url，不参与签名
          wechatJson.return_url = baseInfo.returnUrl;
          //开始拼接授权url
          let redirect_uri = app.config.html5.gateway +  this.ctx.service.weixin.stringifyParams(wechatJson)
          //完成获取code的url
          returnInfo.wechat_url = 'https://open.weixin.qq.com/connect/oauth2/authorize?appid='+weixinConfig.appid+'&redirect_uri='
            +encodeURIComponent(redirect_uri)+'&response_type=code&scope=snsapi_base#wechat_redirect';
          //个别代理商的处理
          if(baseInfo.agentInfo.agentCode ==='100052-1'){
            redirect_uri = 'http://nk.ksbao.com/qRcodePayNew?'+this.ctx.service.weixin.stringifyParams(wechatJson);
            returnInfo.wechat_url = 'http://www.yy35.net/wxcode.html?appid=wxb1211588bcb3371b&scope=snsapi_base&state=hello-world&redirect_uri=' + encodeURIComponent(redirect_uri)
          }
          if(baseInfo.agentInfo.agentCode ==='300189-1'){
            redirect_uri = 'https://myys.ksbao.com/qRcodePayNew?' + this.ctx.service.weixin.stringifyParams(wechatJson)
            returnInfo.wechat_url = 'https://open.weixin.qq.com/connect/oauth2/authorize?appid='+weixinConfig.appid+'&redirect_uri='
              +encodeURIComponent(redirect_uri)+'&response_type=code&scope=snsapi_base#wechat_redirect';
          }
          if(baseInfo.agentInfo.agentCode ==='yuekao'){
            redirect_uri = 'http://myys.ksbao.com/' + this.ctx.service.weixin.stringifyParams(wechatJson)
          }
          //通过getOpenID接口生成支付连接所需参数
          break;
        case 'weixin_xcx':
          weixinConfig.mch_id = '1218349401';
          weixinConfig.appid = 'wx0792feb530d11acb'; //官方小程序指定用appid
          weixinConfig.key='KUFKjs16346ewf8p2LA6lao3pj15lefl';

          //创建订单,锁定优惠卷
          await this.createOrder(baseInfo, orderInfo,weixinConfig.appid);
          //获取小程序信息
          const wechatmsg = await this.ctx.service.weixin.createUnifiedOrder(returnInfo.softName, orderInfo.orderID, orderInfo.price * 100, weixinConfig, 'wechat',baseInfo.openID);
          //生成签名
          let signInfo = {
            appId:weixinConfig.appid,
            timeStamp:parseInt(new Date().getTime()/1000).toString(),
            nonceStr:this.getRandomString(16),
            package:'prepay_id='+wechatmsg.prepay_id,
            signType:'MD5'
          }
          signInfo.paySign = this.ctx.service.weixin.sign(this.ctx.service.weixin.stringifyParams(signInfo),{key:weixinConfig.key},'MD5');
          returnInfo.xcxInfo = {
            prepay_id: wechatmsg.prepay_id,
            appid: weixinConfig.appid,
            timeStamp: signInfo.timeStamp,
            nonceStr: signInfo.nonceStr,
            sign: signInfo.paySign
          }
          break;
        default:
          throw new Error('无效的支付方式');
          break;
      }
      return returnInfo
    }
    //验证考季卡,年卡信息
    async checkKJK(baseInfo){
      //获取考季卡时间
      //let endTime = this.ctx.service.time.checkEndTime(baseInfo.appInfo.appID,baseInfo.vnInfo.vn,null,baseInfo.priceInfo.days)
      let endTime = this.ctx.service.process.service.getKJKInfo(baseInfo.appInfo.appID,baseInfo.vnInfo.vn)
      //判断是否考季卡
      if(endTime){
        //考季卡到期前剩余时间大于7天不允许续费
        let current = new Date().getTime() //毫秒
        let end = new Date(endTime).getTime() //毫秒
        let compare = 7 * 24 * 60 * 60 * 1000 //毫秒
        if(current + compare < end){
          throw new Error('该科目已经购买');
        }
      }
    }
    //获取减免金额
    async getoffprice(baseInfo){
      try {
        let offprice = 0
        if(baseInfo.couponUserInfo) {
          for(let c in baseInfo.couponUserInfo){
            //offprice += parseFloat(baseInfo.couponUserInfo[c].offPrice)
            offprice += parseFloat(baseInfo.couponUserInfo[c].offPrice) + Math.round(((baseInfo.priceInfo.price) * (1 - baseInfo.couponUserInfo[c].discount))*100)/100;
            if(baseInfo.couponUserInfo[c].offPrice>0&&baseInfo.couponUserInfo[c].discount!=1){
              throw new Error('优惠券配置不正确');
            }
          }
          offprice = Math.round(offprice*100)/100
          //折扣的
          //if(baseInfo.couponUserInfo.length == 1 && baseInfo.couponUserInfo[0].discount){
          //    offprice = Math.round((baseInfo.priceInfo.price * (1 - baseInfo.couponUserInfo[0].discount))*100)/100;
          //}
        }
        return offprice
      }
      catch (e){
        throw new Error('无效的支付金额');
      }
    }
    //获取充值码规则
    async getCodeLimit(userID,appID,vn){
      let rules = await this.ctx.service.process.service.getVnInfo(['vn', 'vname','rules'], {vn})
      if(rules&&rules.rules){
        let rulesJson = JSON.parse(rules.rules)
        if(rulesJson.hideByVip){
          //该规则是一个数组，当数组中任意一个班次已经开通，则隐藏本班次。
          let ruleshide = await this.ctx.service.process.service.getVipInfo(['endTime'],{appID:appID,vn:rulesJson.hideByVip})
          //有效未过期已经开通的科目,触发限制
          if(ruleshide&&ruleshide.length>0&&new Date(ruleshide.endTime)>new Date()){throw new Error('该班次无法继续充值')}
        }
        if(rulesJson.showByVip){
          //该规则是一个数组，当数组中任意一个班次已经开通，才显示本班次。
          let rulesshow = await this.ctx.service.process.service.getVipInfo(['endTime'],{userID,appID,vn:rulesJson.showByVip})
          if(!rulesshow||rulesshow.length===0||new Date(rulesshow.endTime)<new Date()){throw new Error('该班次需要充值前置科目')}
        }
      }
    }
    //支付宝统一配置
    async getAlipayConfig(baseInfo){
      //判断代理商是否激活状态
      if(baseInfo.agentInfo&&baseInfo.agentInfo.enable===1) {
        //如果代理商没有自己的支付宝信息就使用官方数据,也就是支付到官方
        if (!baseInfo.alipayPayInfo && baseInfo.mainAlipayPayInfo) {
          baseInfo.alipayPayInfo = baseInfo.mainAlipayPayInfo;
        }
      }
      let config = {
        notify_url:app.config.address+'/notify/alipayNotify',
        return_url:baseInfo.returnUrl,
        app_id:baseInfo.alipayPayInfo.AppID,
        seller_id:baseInfo.alipayPayInfo.PID,
        appPriKey:`-----BEGIN PRIVATE KEY-----\n` + baseInfo.alipayPayInfo.PrivateKey + `\n-----END PRIVATE KEY-----`,
        appPubKey:`-----BEGIN PUBLIC KEY-----\n` + baseInfo.alipayPayInfo.PublicKey + `\n-----END PUBLIC KEY-----`,
        aliPubKeyRSA2:`-----BEGIN PUBLIC KEY-----\n` + baseInfo.alipayPayInfo.AlipayPublick + `\n-----END PUBLIC KEY-----`,
        aliPubKeyRSA:`-----BEGIN PUBLIC KEY-----\n` + baseInfo.alipayPayInfo.AlipayPublick + `\n-----END PUBLIC KEY-----`,
        gateway:app.config.alipayGateway,
        agentCode:baseInfo.alipayPayInfo.Agent_ID,
        keys:baseInfo.alipayPayInfo.Keys,
        wapkeys:baseInfo.alipayPayInfo.WapKey
      }
      if(baseInfo.agentInfo.agentCode==='555'){
        config.gateway = 'https://openapi.alipaydev.com/gateway.do';
      }
      //花呗分期处理
      if(baseInfo.hbfqnum){
        let huabeiJson = baseInfo.agentInfo.huabeiJson;
        if(!huabeiJson){
          throw new Error('该代理商不支持花呗分期');
        }
        //转换格式
        let hbjson = JSON.parse(huabeiJson).feeRule;
        let jbjson = {}
        for(let i in hbjson){
          jbjson[hbjson[i].Hb_fq_num] = hbjson[i].Hb_fq_seller_percent;
        }
        config.usehuabei = true;
        config.huabeiJson = JSON.stringify({"hb_fq_num":baseInfo.hbfqnum,"hb_fq_seller_percent":jbjson[baseInfo.hbfqnum]})
      }
      this.ctx.logger.info(config)
      return config
    }
    //微信统一配置
    async getWeixinConfig(baseInfo){
      //判断代理商是否激活状态
      if(baseInfo.agentInfo&&baseInfo.agentInfo.enable===1){
        if(['wechat','HTML5','weixin_xcx'].findIndex(t=>t==baseInfo.payType)>=0){
          //符合公众号支付
          //如果代理商没有微信信息或者关闭状态，并且微信支付未设置，默认支付到官方
          if((!baseInfo.weixinPayInfo||baseInfo.weixinPayInfo.enabled!==1)&&baseInfo.wechatWeixinPayInfo&&baseInfo.agentInfo.weixinPay!==1||(baseInfo.weixinPayInfo&&baseInfo.weixinPayInfo.isOfficial==1)){
            baseInfo.weixinPayInfo = baseInfo.wechatWeixinPayInfo;
          }

          //当是官方的时候，默认使用WXJSZPI数据
          if(['888','889'].findIndex(t=>t==baseInfo.agentInfo.agentCode)>=0){
            baseInfo.weixinPayInfo = baseInfo.wechatWeixinPayInfo;
          }
          //if(baseInfo.weixinPayInfo&&baseInfo.weixinPayInfo.isOfficial==1){
          //    baseInfo.weixinPayInfo = baseInfo.wechatWeixinPayInfo;
          //}
        }else {
          //符合扫码和原生支付
          //如果代理商没有微信信息或者关闭状态，并且微信支付未设置，默认支付到官方
          // if((!baseInfo.weixinPayInfo||baseInfo.weixinPayInfo.enabled!==1)&&baseInfo.appWeixinPayInfo&&baseInfo.agentInfo.weixinPay!==1||(baseInfo.weixinPayInfo&&baseInfo.weixinPayInfo.isOfficial==1)){
          //     baseInfo.weixinPayInfo = baseInfo.appWeixinPayInfo;
          // }
          //if(baseInfo.weixinPayInfo&&baseInfo.weixinPayInfo.isOfficial==1){
          //    baseInfo.weixinPayInfo = baseInfo.appWeixinPayInfo;
          //}
          //微信是否付款到代理商
          if(baseInfo.agentInfo.weixinPay!==1){
            baseInfo.weixinPayInfo = baseInfo.appWeixinPayInfo;
          }
          //如果代理商没有微信信息或者关闭状态,默认支付到官方
          if(!baseInfo.weixinPayInfo||baseInfo.weixinPayInfo.enabled!==1){
            baseInfo.weixinPayInfo = baseInfo.appWeixinPayInfo;
          }

        }
      }
      let config = {
        notify_url: app.config.address + '/notify/weixinNotify',
        mch_id: baseInfo.weixinPayInfo.partner,
        gateway: 'https://api.mch.weixin.qq.com',
        appid: baseInfo.weixinPayInfo.appID,
        key: baseInfo.weixinPayInfo.key
      }
      return config
    }
    //获取折扣
    async getDiscount(baseInfo){
      let discount = baseInfo.priceInfo.discount;
      let agentCode = baseInfo.agentInfo.agentCode;
      //处理特殊代理商
      let agentKey = 'ac' + agentCode.replace(/-/g, 'X');
      let specialAgent = this.service.specialAgent[agentKey];
      let specialRules = null;
      try {
        if (specialAgent) discount = await specialAgent.getDiscount(baseInfo.userInfo.userName);
      }
      catch (e){
        throw new Error('代理商不存在,' + agentKey)
      }
      return discount
    }
    //初始化
    async couponUserInit(couponUserInfo){
      let returnCoupon = {}
      returnCoupon.endTime = couponUserInfo.endTime;
      let useCouponLimit = JSON.parse(couponUserInfo.useCouponLimit||`{}`);
      returnCoupon.whiteList = useCouponLimit.whiteList|| []
      returnCoupon.blackList = useCouponLimit.blackList|| []
      returnCoupon.discount = useCouponLimit.discount|| 1;
      returnCoupon.limitprice = useCouponLimit.limitprice|| 0;
      returnCoupon.offprice =useCouponLimit.offprice || 0;
      //returnCoupon.repeatList = useCouponLimit.repeatList || []
      return returnCoupon;
    }


    //使用白名单、黑名单功能、叠加功能
    async checkCoupon(baseInfo){

      for(let i in baseInfo.couponUserInfo){
        let couponUserContent = await this.couponUserInit(baseInfo.couponUserInfo[i]);
        console.log(couponUserContent)
        //验证到期时间
        if(baseInfo.couponUserInfo[i].endTime<new Date()){
          throw new Error('该优惠券已过期');
        }
        //减免价格限制
        if(baseInfo.couponUserInfo[i].offPrice>parseFloat(baseInfo.priceInfo.price)){
          throw new Error('该价格不符合优惠券减免规则');
        }
        if(couponUserContent.limitprice && couponUserContent.limitprice>parseFloat(baseInfo.priceInfo.price)){
          throw new Error('该价格不符合优惠券减免规则');
        }
        //叠加使用限制
        if(baseInfo.couponUserInfo[i].repeatList && JSON.parse(baseInfo.couponUserInfo[i].repeatList).length>0){
          if (JSON.parse(baseInfo.couponUserInfo[i].repeatList).findIndex(t=>t == baseInfo.couponUserInfo[i].couponID) < 0) {
            throw new Error('该优惠券无法叠加使用');
          }
        }
        let blend = {}
        if(!couponUserContent.blend||couponUserContent.blend===false||couponUserContent.blend==='false'){
          //该优惠券不允许自身叠加
          if(blend[baseInfo.couponUserInfo[i].CouponID]===true){
            throw new Error('该优惠券无法自身叠加使用');
          }
          blend[baseInfo.couponUserInfo[i].ID] = true;
        }

        //验证白名单
        let whiteIncrement = {}
        let blackIncrement = {}
        if(couponUserContent.whiteList.vn){
          whiteIncrement.vnIncrement = 0;
          if (couponUserContent.whiteList.vn.findIndex(t=>t == baseInfo.vnInfo.vn) >= 0) {
            whiteIncrement.vnIncrement = whiteIncrement.vnIncrement + 1;
          }
        }
        if(couponUserContent.whiteList.agentCode) {
          whiteIncrement.agentCodeIncrement = 0;
          if (couponUserContent.whiteList.agentCode.findIndex(t=>t == baseInfo.agentInfo.agentCode) >= 0) {
            whiteIncrement.agentCodeIncrement = whiteIncrement.agentCodeIncrement + 1;
          }
        }
        if(couponUserContent.whiteList.appEName) {
          whiteIncrement.appENameIncrement = 0;
          if (couponUserContent.whiteList.appEName.findIndex(t=>t == baseInfo.appInfo.appEName) >= 0) {
            whiteIncrement.appENameIncrement = whiteIncrement.appENameIncrement + 1;
          }
        }
        //验证黑名单
        if(couponUserContent.blackList.vn){
          blackIncrement.vnIncrement = 0;
          if (couponUserContent.blackList.vn.findIndex(t=>t == baseInfo.vnInfo.vn) >= 0) {
            blackIncrement.vnIncrement = blackIncrement.vnIncrement + 1;
          }
        }
        if(couponUserContent.blackList.agentCode) {
          blackIncrement.agentCodeIncrement = 0;
          if (couponUserContent.blackList.agentCode.findIndex(t=>t == baseInfo.agentInfo.agentCode) >= 0) {
            blackIncrement.agentCodeIncrement = blackIncrement.agentCodeIncrement + 1;
          }
        }
        if(couponUserContent.blackList.appEName) {
          blackIncrement.appENameIncrement = 0;
          if (couponUserContent.blackList.appEName.findIndex(t=>t == baseInfo.appInfo.appEName) >= 0) {
            blackIncrement.appENameIncrement = blackIncrement.appENameIncrement + 1;
          }
        }

        //白名单判断
        for(let i in whiteIncrement){
          if(whiteIncrement[i]==0){
            throw new Error('该优惠券使用被限制');
          }
        }
        //黑名单判断
        for(let i in blackIncrement){
          if(blackIncrement[i]>0){
            throw new Error('该优惠券使用被限制');
          }
        }
      }
    }
    //验证用户订单
    async checkOrder({guid,orderID}){

      let userInfo = await this.ctx.service.common.getUserInfo(guid);

      let orderInfo = await this.ctx.service.process.service.getSimpleInfo('userorder',{orderID},['status'],'findOne')

      return {status:orderInfo.status,orderID}
    }
  }
  return Service;
}
