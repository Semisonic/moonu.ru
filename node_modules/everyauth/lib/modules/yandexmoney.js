var oauthModule = require('./oauth2')
  , url = require('url')
  , fs = require('fs')
  , rest = require('restler')
  , crypto = require('crypto');

var yandexmoney = module.exports =
  oauthModule.submodule('yandexmoney')
  .configurable({
    //display: '',
    scope:  ''
  })
  .oauthHost('https://sp-money.yandex.ru')
  .apiHost('https://money.yandex.ru/api')
  .entryPath('/auth/yandexmoney')
  .callbackPath('/auth/yandexmoney/callback')

  // .authQueryParam('display', function () {
  //     return this._display && this.display();
  // })
  .authQueryParam('response_type', 'code')
  .authQueryParam('scope', function () {
      return this._scope && this.scope();
    })

  .accessTokenParam('grant_type', 'authorization_code')
  .accessTokenHttpMethod('post')
  .postAccessTokenParamsVia('data')
  .accessTokenPath('/oauth/token')

  .fetchOAuthUser( function (accessToken) {
      var promise = this.Promise();
      rest.post(this.apiHost()+'/account-info', {
            headers: {
              'authorization': 'Bearer ' + accessToken,
              'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
              'Content-Length': '0'
              }
        }).on('success', function (data, res) {
            var oauthUser = { id: data.account };
            promise.fulfill(oauthUser);
          }).on('error', function (data, res) {
              promise.fail(data);
            });
      return promise;
    })

  .authCallbackDidErr(function(req) {
      var parsedUrl = url.parse(req.url, true);
      return parsedUrl.query && !!parsedUrl.query.error;
    })

  .convertErr( function (data) {
      return new Error(JSON.parse(data).error.error_msg);
    });
